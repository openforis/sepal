import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import log4js from 'log4js'

import {CONTENTS, importFromMysql, MissingSourceError, StaleImportError} from '#sepal/db/mysqlImport'
import {createConnection} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

const FIXTURES = join(dirName(import.meta.url), 'fixtures', 'mysqlImport')
const SQL_PATH = join(FIXTURES, 'mysql-import.sql')
const FINGERPRINT = {item: 'at', tag: CONTENTS}

describe('importFromMysql', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'mysqlimport', migrations: join(FIXTURES, 'mysql')})
    })

    // The runner leaves its record table behind on success, which a baseline reset would not remove.
    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'mysqlimport', migrations: join(FIXTURES, 'postgres')})
    })

    afterEach(() => {
        configureNoLogging()
        return target?.remove()
    })

    after(() => source?.remove())

    describe('on first start', () => {
        test('skips without recording anything when no MySQL host is configured', async () => {
            await seedItem(anItem())

            const result = await importFromMysql({...importOf(source, target), mysql: {}})

            assert.deepEqual(result, {outcome: 'skipped'})
            assert.equal(await recordTableExists(target), false)
            assert.deepEqual(await importedItems(target), [])
        })

        test('copies the source rows on first start', async () => {
            const item = anItem({note: 'Café 😀 漢字', flag: 1, doc: {name: 'Ünïcode 😀', values: [1, 2]}})
            await seedItem(item)
            await seedTag('a-tag')

            const result = await importFromMysql(importOf(source, target))

            assert.deepEqual(result, {outcome: 'imported'})
            const [imported] = await importedItems(target)
            assert.equal(imported.id, item.id)
            assert.equal(imported.username, item.username)
            assert.equal(imported.note, item.note)
            assert.equal(imported.flag, true)
            assert.deepEqual(imported.doc, item.doc)
            assert.deepEqual(await importedTags(target), ['a-tag'])
        })

        test('copies an enum column as its text', async () => {
            await seedTag('a-tag', 'SPECIAL')

            await importFromMysql(importOf(source, target))

            const {rows} = await target.query('SELECT name, kind FROM tag')
            assert.deepEqual(rows, [{name: 'a-tag', kind: 'SPECIAL'}])
        })

        test('imports timestamps as the same instant', async () => {
            const item = anItem({at: new Date('2026-03-04T05:06:07.891Z')})
            await seedItem(item)
            await setTargetSessionSettings(target, {timezone: 'Asia/Tokyo'})

            await importFromMysql(importOf(source, target))

            const [imported] = await importedItems(target)
            assert.equal(imported.at.toISOString(), item.at.toISOString())
        })

        test('records an empty import when the source database does not exist', async () => {
            const absent = `absent_${randomBytes(6).toString('hex')}`

            const result = await importFromMysql({...importOf(source, target), sourceDb: absent})

            assert.deepEqual(result, {outcome: 'empty'})
            const again = await importFromMysql({...importOf(source, target), sourceDb: absent})
            assert.deepEqual(again, {outcome: 'verified'})
        })

        test('warns, naming the source database, when it records an empty import', async () => {
            const absent = `absent_${randomBytes(6).toString('hex')}`
            const warnings = recordWarnings()

            await importFromMysql({...importOf(source, target), sourceDb: absent})

            assert.equal(warnings.length, 1)
            assert.match(warnings[0], new RegExp(absent))
        })

        test('rolls back everything when the import SQL fails', async () => {
            await seedTag('a-tag')
            await seedItem(anItem({doc: 'not json'}))

            const imported = importFromMysql(importOf(source, target))

            await assert.rejects(imported, /json/i)
            assert.equal(await recordTableExists(target), false)
            assert.deepEqual(await foreignObjects(target), {schemas: 0, servers: 0, userMappings: 0})
            assert.deepEqual(await importedItems(target), [])
            assert.deepEqual(await importedTags(target), [])
        })

        test('leaves no foreign server, user mapping or schema behind after importing', async () => {
            await seedItem(anItem())

            await importFromMysql(importOf(source, target))

            assert.deepEqual(await foreignObjects(target), {schemas: 0, servers: 0, userMappings: 0})
        })
    })

    describe('on a later start', () => {
        test('does not import a second time', async () => {
            await seedItem(anItem())
            await importFromMysql(importOf(source, target))

            const result = await importFromMysql(importOf(source, target))

            assert.deepEqual(result, {outcome: 'verified'})
            assert.equal((await importedItems(target)).length, 1)
            assert.deepEqual(await foreignObjects(target), {schemas: 0, servers: 0, userMappings: 0})
        })

        test('refuses to start when a CONTENTS table changed after the import', async () => {
            await seedTag('a-tag')
            await importFromMysql(importOf(source, target))
            await source.query('UPDATE tag SET name = ? WHERE name = ?', ['renamed-tag', 'a-tag'])

            const restarted = importFromMysql(importOf(source, target))

            await assert.rejects(restarted, staleImportOf(source, target))
        })

        test('refuses to start when a tracked column advanced', async () => {
            const item = anItem({at: new Date('2026-03-04T05:06:07.891Z')})
            await seedItem(item)
            await importFromMysql(importOf(source, target))
            await source.query('UPDATE item SET at = FROM_UNIXTIME(? / 1000) WHERE id = ?', [item.at.getTime() + 1000, item.id])

            const restarted = importFromMysql(importOf(source, target))

            await assert.rejects(restarted, staleImportOf(source, target))
        })

        test('refuses to start, and advises against a drop, when the source database disappeared', async () => {
            const vanishing = await createMysqlTestDb({name: 'mysqlimport', migrations: join(FIXTURES, 'mysql')})
            await vanishing.query('INSERT INTO tag (name, kind) VALUES (?, ?)', ['a-tag', 'PLAIN'])
            await importFromMysql(importAsAdministratorOf(vanishing, target))
            await vanishing.remove()

            const restarted = importFromMysql(importAsAdministratorOf(vanishing, target))

            await assert.rejects(restarted, missingSourceOf(vanishing, target))
        })

        test('refuses to start, and advises against a drop, when the source tables were emptied', async () => {
            await seedItem(anItem())
            await seedTag('a-tag')
            await importFromMysql(importOf(source, target))
            await source.query('DELETE FROM item')
            await source.query('DELETE FROM tag')

            const restarted = importFromMysql(importOf(source, target))

            await assert.rejects(restarted, missingSourceOf(source, target))
        })

        test('verifies a CONTENTS table whatever output settings the session has', async () => {
            await seedItem(anItem())
            const byContents = {...importOf(source, target), fingerprint: {item: CONTENTS}}
            await importFromMysql(byContents)
            await setTargetSessionSettings(target, {
                DateStyle: 'SQL, DMY', IntervalStyle: 'iso_8601', extra_float_digits: '0', bytea_output: 'escape'
            })

            const result = await importFromMysql(byContents)

            assert.deepEqual(result, {outcome: 'verified'})
        })

        test('starts unverified when MySQL is unreachable after a completed import', async () => {
            await seedItem(anItem())
            await importFromMysql(importOf(source, target))
            const unreachable = {...importOf(source, target).mysql, host: 'nonexistent'}

            const result = await importFromMysql({...importOf(source, target), mysql: unreachable})

            assert.deepEqual(result, {outcome: 'unverified'})
            assert.deepEqual(await foreignObjects(target), {schemas: 0, servers: 0, userMappings: 0})
        })
    })

    const seedItem = ({id, username, note, flag, doc, at}) =>
        source.query(
            'INSERT INTO item (id, username, note, flag, doc, at) VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))',
            [id, username, note, flag, typeof doc === 'string' ? doc : JSON.stringify(doc), at.getTime()]
        )

    const seedTag = (name, kind = 'PLAIN') =>
        source.query('INSERT INTO tag (name, kind) VALUES (?, ?)', [name, kind])
})

const anItem = (overrides = {}) => ({
    id: randomBytes(8).toString('hex'),
    username: 'Alice',
    note: 'a note',
    flag: 0,
    doc: {some: 'document'},
    at: new Date('2026-01-02T03:04:05.678Z'),
    ...overrides
})

const importOf = (source, target) => ({
    dbName: target.dbName,
    sourceDb: source.dbName,
    sqlPath: SQL_PATH,
    fingerprint: FINGERPRINT,
    mysql: {
        host: process.env.MYSQL_FDW_HOST ?? process.env.MYSQL_HOST,
        user: source.account.username,
        password: source.account.password
    }
})

// Only the administrator sees a database once it is gone: the test account is dropped with it.
const importAsAdministratorOf = (source, target) => ({
    ...importOf(source, target),
    mysql: {...importOf(source, target).mysql, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD}
})

const staleImportOf = (source, target) => error => {
    assert.ok(error instanceof StaleImportError)
    assert.match(error.message, new RegExp(`^${source.dbName} in MySQL changed after it was imported into Postgres database ${target.dbName} at ${ISO_INSTANT}\\.`))
    assert.match(error.message, new RegExp(`writes made to ${target.dbName} since then`))
    assert.match(error.message, new RegExp(`/postgres/${target.dbName}\\.dump`))
    return true
}

const missingSourceOf = (source, target) => error => {
    assert.ok(error instanceof MissingSourceError)
    assert.match(error.message, new RegExp(`${source.dbName}.* imported into Postgres database ${target.dbName} at ${ISO_INSTANT}`))
    assert.match(error.message, /restore it in MySQL, or unset MYSQL_HOST/i)
    assert.match(error.message, new RegExp(`do not drop ${target.dbName}`, 'i'))
    return true
}

const ISO_INSTANT = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z'

const recordWarnings = () => {
    const warnings = []
    log4js.configure({
        appenders: {recorder: {type: {configure: () => event => warnings.push(event.data.join(' '))}}},
        categories: {default: {appenders: ['recorder'], level: 'warn'}}
    })
    return warnings
}

const importedItems = async target => {
    const {rows} = await target.query('SELECT id, username, note, flag, doc, at FROM item ORDER BY id')
    return rows
}

const importedTags = async target => {
    const {rows} = await target.query('SELECT name FROM tag ORDER BY name')
    return rows.map(({name}) => name)
}

const recordTableExists = async target => {
    const {rows: [{exists}]} = await target.query('SELECT to_regclass(\'mysql_import\') IS NOT NULL AS exists')
    return exists
}

const foreignObjects = async target => {
    const {rows: [found]} = await target.query(`
        SELECT
            (SELECT count(*) FROM pg_namespace WHERE nspname = 'mysql_source') AS schemas,
            (SELECT count(*) FROM pg_foreign_server) AS servers,
            (SELECT count(*) FROM pg_user_mappings) AS "userMappings"
    `)
    return found
}

// Scoped to the target database, which is dropped with it. A role's setting there outranks its own.
const setTargetSessionSettings = async (target, settings) => {
    const superuser = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    try {
        for (const [name, value] of Object.entries(settings)) {
            await superuser.query(
                `ALTER ROLE ${superuser.escapeIdentifier(process.env.POSTGRES_USER)} IN DATABASE ${superuser.escapeIdentifier(target.dbName)} SET ${name} = ${superuser.escapeLiteral(value)}`
            )
        }
    } finally {
        await superuser.end()
    }
}
