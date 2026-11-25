import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('task-manager database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the task table in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        assert.ok(new Set(['task']).isSubsetOf(new Set(await tableNames(dbName))))
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const task = await insertTask(dbName, aTask())

        const found = await query(dbName, 'SELECT username FROM task WHERE username = $1', [task.username.toUpperCase()])

        assert.deepEqual(found.rows, [{username: task.username}])
    })

    test('rejects a second task holding the same api key hash', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        await insertTask(dbName, aTask({id: 'first', api_key_hash: 'a'.repeat(64)}))

        const duplicate = insertTask(dbName, aTask({id: 'second', api_key_hash: 'a'.repeat(64)}))

        await assert.rejects(duplicate, isUniqueViolation)
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `task_manager_migrations_test_${randomBytes(6).toString('hex')}`
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

    const insertTask = async (dbName, task) => {
        await query(
            dbName,
            `INSERT INTO task (id, state, username, operation, params, status_description, api_key_hash, creation_time, update_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [task.id, task.state, task.username, task.operation, task.params, task.status_description,
                task.api_key_hash, task.creation_time, task.update_time]
        )
        return task
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aTask = overrides => ({
    id: 'a-task',
    state: 'PENDING',
    username: 'admin',
    operation: 'image.GEE',
    params: {},
    status_description: '{}',
    api_key_hash: null,
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z'),
    ...overrides
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
