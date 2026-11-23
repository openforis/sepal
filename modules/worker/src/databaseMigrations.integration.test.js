import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('worker database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', SUPERUSER)
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertSession(dbName, aWorkerSession())

        const found = await query(dbName, 'SELECT username FROM worker_session WHERE username = $1', [stored.username.toUpperCase()])

        assert.deepEqual(found.rows, [{username: stored.username}])
    })

    test('rejects a second app association of the same path for a differently cased username', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const association = await insertSessionApp(dbName, aSessionApp())

        const duplicate = insertSessionApp(dbName, aSessionApp({username: association.username.toUpperCase()}))

        await assert.rejects(duplicate, isUniqueViolation)
    })

    describe('schema migrations', () => {
        test('create the worker tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set([
                'instance_claim', 'instance_usage_hourly', 'instance_usage_sample', 'session_app', 'worker_session'
            ]).isSubsetOf(new Set(tables)))
            assert.ok(!tables.includes('task'))
        })

        test('create them empty, importing nothing', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const sessions = await query(dbName, 'SELECT id FROM worker_session')
            assert.deepEqual(sessions.rows, [])
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `worker_migrations_test_${randomBytes(6).toString('hex')}`
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

    const insertSession = async (dbName, session) => {
        await query(
            dbName,
            `INSERT INTO worker_session (id, state, username, worker_type, instance_type, instance_id, host,
                                         creation_time, update_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [session.id, session.state, session.username, session.worker_type, session.instance_type,
                session.instance_id, session.host, session.creation_time, session.update_time]
        )
        return session
    }

    const insertSessionApp = async (dbName, association) => {
        await query(
            dbName,
            `INSERT INTO session_app (username, app_path, session_id, creation_time)
             VALUES ($1, $2, $3, $4)`,
            [association.username, association.app_path, association.session_id, association.creation_time]
        )
        return association
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aWorkerSession = () => ({
    id: 'a-session', state: 'ACTIVE', username: 'bob', worker_type: 'SANDBOX', instance_type: 'm5.large',
    instance_id: 'i-1', host: 'host', creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const aSessionApp = overrides => ({
    username: 'bob', app_path: '/app', session_id: 'a-session', creation_time: new Date('2026-01-01T00:00:00Z'),
    ...overrides
})

const SUPERUSER = {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD}
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
