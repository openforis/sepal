import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'

describe('initDb', () => {
    let admin
    let migrations
    let dbName

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres')
        migrations = await aMigrationsDirectory({
            '001.do.create-item.sql': 'CREATE TABLE item (id text PRIMARY KEY);'
        })
    })

    beforeEach(() => {
        dbName = `db_test_${randomBytes(6).toString('hex')}`
    })

    afterEach(() => admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`))

    after(async () => {
        await admin?.end()
        await rm(migrations, {recursive: true, force: true})
    })

    test('creates a missing database and applies migrations', async () => {
        const result = await initDb(dbName, migrations)

        assert.deepEqual(result, {created: true, migrated: true, version: 1})
        assert.deepEqual(await tablesIn(dbName), ['item', 'schema_version'])
    })

    test('reports created: false on an existing database', async () => {
        await admin.query(`CREATE DATABASE ${dbName}`)

        const result = await initDb(dbName, migrations)

        assert.deepEqual(result, {created: false, migrated: true, version: 1})
    })

    test('validates instead of migrating the second time', async () => {
        await initDb(dbName, migrations)

        const result = await initDb(dbName, migrations)

        assert.deepEqual(result, {created: false, migrated: false, version: 1})
    })

    test('records its history in the named schema table', async () => {
        await initDb(dbName, migrations, {schemaTable: 'schema_version_custom'})

        assert.deepEqual(await tablesIn(dbName), ['item', 'schema_version_custom'])
    })

    test('lets two concurrent calls for a new database both succeed', async () => {
        const results = await Promise.all([initDb(dbName, migrations), initDb(dbName, migrations)])

        assert.deepEqual(results.map(({created}) => created).sort(), [false, true])
        assert.deepEqual(results.map(({migrated}) => migrated).sort(), [false, true])
        assert.deepEqual(results.map(({version}) => version), [1, 1])
    })

    const tablesIn = async name => {
        const client = await createConnection(name)
        try {
            const {rows} = await client.query(`
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name
            `)
            return rows.map(({table_name}) => table_name)
        } finally {
            await client.end()
        }
    }
})

const aMigrationsDirectory = async files => {
    const path = await mkdtemp(join(tmpdir(), 'postgres-migrations-'))
    for (const [name, sql] of Object.entries(files)) {
        await writeFile(join(path, name), sql)
    }
    return path
}
