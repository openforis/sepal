import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('message database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the message and notification tables in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const tables = await tableNames(dbName)
        assert.ok(new Set(['message', 'notification']).isSubsetOf(new Set(tables)))
    })

    test('creates empty message and notification tables', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        assert.deepEqual(await rowCounts(dbName), {messages: 0, notifications: 0})
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertMessage(dbName, aMessage())

        const found = await query(dbName, 'SELECT username FROM message WHERE username = $1', [stored.username.toUpperCase()])

        assert.deepEqual(found.rows, [{username: stored.username}])
    })

    test('rejects a notification for a username that differs only in case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const message = await insertMessage(dbName, aMessage())
        await insertNotification(dbName, message.id, 'reader')

        const duplicate = insertNotification(dbName, message.id, 'READER')

        await assert.rejects(duplicate, isUniqueViolation)
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `message_migrations_test_${randomBytes(6).toString('hex')}`
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

    const insertMessage = async (dbName, message) => {
        await query(
            dbName,
            `INSERT INTO message (id, username, subject, contents, type, creation_time, update_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [message.id, message.username, message.subject, message.contents, message.type, message.creation_time, message.update_time]
        )
        return message
    }

    const insertNotification = (dbName, messageId, username) =>
        query(dbName, 'INSERT INTO notification (message_id, username, state) VALUES ($1, $2, $3)', [messageId, username, 'READ'])

    const rowCounts = async dbName => {
        const {rows: [counts]} = await query(
            dbName,
            'SELECT (SELECT COUNT(*) FROM message) AS messages, (SELECT COUNT(*) FROM notification) AS notifications'
        )
        return counts
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aMessage = overrides => ({
    id: 'a-message',
    username: 'admin',
    subject: 'A subject',
    contents: 'Some contents',
    type: 'SYSTEM',
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z'),
    ...overrides
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
