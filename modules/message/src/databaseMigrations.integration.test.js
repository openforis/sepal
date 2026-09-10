import {randomBytes} from 'crypto'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('message database migrations', () => {
    let admin
    const reserved = []

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertMessage(dbName, aMessage())

        const [found] = await admin.query('SELECT username FROM ??.message WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        expect(found).toEqual([{username: stored.username}])
        expect(collations).toEqual({
            message: 'ascii_general_ci',
            notification: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create the message and notification tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['message', 'notification']))
        })

        test('create empty message and notification tables', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const counts = await rowCounts(dbName)
            expect(counts).toEqual({messages: 0, notifications: 0})
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `message_migrations_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertMessage = async (dbName, message) => {
        await admin.query('INSERT INTO ??.message SET ?', [dbName, message])
        return message
    }

    const rowCounts = async dbName => {
        const [[{messages}]] = await admin.query('SELECT COUNT(*) AS messages FROM ??.message', [dbName])
        const [[{notifications}]] = await admin.query('SELECT COUNT(*) AS notifications FROM ??.notification', [dbName])
        return {messages, notifications}
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

const aMessage = () => ({
    id: 'a-message',
    username: 'admin',
    subject: 'A subject',
    contents: 'Some contents',
    type: 'SYSTEM',
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
