import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('storage database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the history table in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const tables = await tableNames(dbName)
        assert.ok(tables.includes('history'))
    })

    test('creates an empty history table', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        assert.deepEqual(await storedIds(dbName), [])
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertRow(dbName, aRow())

        const found = await query(dbName, 'SELECT username FROM history WHERE username = $1', [stored.username.toUpperCase()])

        assert.deepEqual(found.rows, [{username: stored.username}])
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `storage_migrations_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(dbName)} OWNER ${admin.escapeIdentifier(process.env.POSTGRES_USER)}`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(dbName)} WITH (FORCE)`)
        }
    }

    const query = async (dbName, sql, params) => {
        const connection = await createConnection(dbName, {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
        try {
            return await connection.query(sql, params)
        } finally {
            await connection.end()
        }
    }

    const insertRow = async (dbName, row) => {
        await query(
            dbName,
            'INSERT INTO history (username, event, timestamp) VALUES ($1, $2, $3)',
            [row.username, row.event, row.timestamp]
        )
        return row
    }

    const storedIds = async dbName => {
        const {rows} = await query(dbName, 'SELECT id FROM history ORDER BY id')
        return rows.map(({id}) => id)
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aRow = overrides => ({
    username: 'bob', event: 'USER_UP', timestamp: new Date('2026-01-01T00:00:00Z'), ...overrides
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
