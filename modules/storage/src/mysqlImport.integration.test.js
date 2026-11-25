import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('storage import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'storage_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'storage_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const first = anEvent({id: 3, username: 'bob', event: 'INACTIVE_LOW'})
        const second = anEvent({id: 7, username: 'alice', event: 'NOTIFIED', timestamp: new Date('2026-02-03T04:05:06Z')})
        await seedEvent(first)
        await seedEvent(second)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await importedEvents(target), [first, second])
    })

    test('continues the identity after the highest imported id', async () => {
        await seedEvent(anEvent({id: 7}))
        await importFromMysql(importOf(source, target))

        const {rows: [added]} = await target.query(
            'INSERT INTO history (username, event, timestamp) VALUES ($1, $2, now()) RETURNING id', ['bob', 'ACTIVE']
        )

        assert.equal(added.id, 8)
    })

    const seedEvent = ({id, username, event, timestamp}) =>
        source.query(
            'INSERT INTO history (id, username, event, timestamp) VALUES (?, ?, ?, FROM_UNIXTIME(? / 1000))',
            [id, username, event, timestamp.getTime()]
        )
})

const anEvent = overrides => ({
    id: 1,
    username: 'bob',
    event: 'ACTIVE',
    timestamp: new Date('2026-01-02T03:04:05Z'),
    ...overrides
})

const importOf = (source, target) => ({
    dbName: target.dbName,
    sourceDb: source.dbName,
    sqlPath: IMPORT_SQL,
    fingerprint: FINGERPRINT,
    mysql: {
        host: process.env.MYSQL_FDW_HOST ?? process.env.MYSQL_HOST,
        user: source.account.username,
        password: source.account.password
    }
})

const importedEvents = async target => {
    const {rows} = await target.query('SELECT id, username, event, timestamp FROM history ORDER BY id')
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
