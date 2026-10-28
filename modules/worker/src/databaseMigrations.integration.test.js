import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('worker database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertSession(dbName, aWorkerSession())

        const [found] = await admin.query('SELECT username FROM ??.worker_session WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        assert.deepEqual(found, [{username: stored.username}])
        assert.deepEqual(collations, {
            worker_session: 'ascii_general_ci',
            task: 'ascii_general_ci',
            session_app: 'ascii_general_ci',
            instance_usage_sample: 'ascii_general_ci',
            instance_usage_hourly: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create the worker tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set([
                'instance_claim', 'instance_usage_hourly', 'instance_usage_sample',
                'session_app', 'task', 'worker_session'
            ]).isSubsetOf(new Set(tables)))
            assert.ok(!tables.includes('instance'))
        })

        test('create them empty, importing nothing', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const sessions = await sessionIds(dbName)
            assert.deepEqual(sessions, [])
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `workermigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertSession = async (dbName, session) => {
        await admin.query('INSERT INTO ??.worker_session SET ?', [dbName, session])
        return session
    }

    const sessionIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.worker_session ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }

    const usernameCollations = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = ?',
            [dbName, 'username']
        )
        return Object.fromEntries(rows.map(({TABLE_NAME, COLLATION_NAME}) => [TABLE_NAME, COLLATION_NAME]))
    }

    const tableNames = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [dbName]
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }
})

const aWorkerSession = () => ({
    id: 'a-session', state: 'ACTIVE', username: 'bob', worker_type: 'SANDBOX', instance_type: 'm5.large',
    instance_id: 'i-1', instance_name: 'amber-lake', host: 'host', creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
