import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('scene database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', SUPERUSER)
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    describe('schema migrations', () => {
        test('create the scene table in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set(['scene']).isSubsetOf(new Set(tables)))
        })

        test('create an empty scene table', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const ids = await storedIds(dbName)
            assert.deepEqual(ids, [])
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `scene_migrations_test_${randomBytes(6).toString('hex')}`
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
        const connection = await createConnection(dbName, SUPERUSER)
        try {
            return await connection.query(sql, params)
        } finally {
            await connection.end()
        }
    }

    const storedIds = async dbName => {
        const {rows} = await query(dbName, 'SELECT id FROM scene ORDER BY id')
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

const SUPERUSER = {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
