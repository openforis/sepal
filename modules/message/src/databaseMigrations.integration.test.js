import {createHash, randomBytes} from 'crypto'
import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, initDatabase} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateMessageDb} from './databaseMigrations.js'

describe('message database migrations', () => {
    let admin
    const reserved = []
    const log = {info: () => {}}

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    describe('schema migrations', () => {
        test('create the message and notification tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDatabase(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['message', 'notification']))
        })

        test('create empty message and notification tables', async () => {
            const dbName = await reserveDatabase()

            await initDatabase(dbName, SCHEMA_PATH)

            const counts = await rowCounts(dbName)
            expect(counts).toEqual({messages: 0, notifications: 0})
        })
    })

    describe('startup on a database migrated by the deployed qualified file', () => {
        test('corrects the schema checksum, keeping the messages', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            const message = await insertMessage(dbName, aMessage())
            const qualified = await recordedSchema(dbName)

            await migrateMessageDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const ids = await messageIds(dbName)
            expect(ids).toEqual([message.id])
            expect(schema).toEqual({...qualified, md5: await checksum(SCHEMA_FILE)})
        })

        test('creates no import history', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()

            await migrateMessageDb(dbName, log)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(['message', 'notification', 'schema_version'])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            await insertMessage(dbName, aMessage())
            await migrateMessageDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateMessageDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDatabase(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateMessageDb(dbName, log)

            await expect(startup).rejects.toThrow(/MD5 checksum failed/)
            const schema = await recordedSchema(dbName)
            expect(schema).toEqual(before)
        })
    })

    // The qualified file built the same tables the portable file builds now; only its checksum differs.
    const aDatabaseMigratedByTheQualifiedFile = async () => {
        const dbName = await reserveDatabase()
        await initDatabase(dbName, SCHEMA_PATH)
        await recordSchemaChecksum(dbName, DEPLOYED_QUALIFIED_MD5)
        return dbName
    }

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

    const recordSchemaChecksum = (dbName, md5) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, md5])

    const databaseState = async dbName => ({
        messages: await messageIds(dbName),
        schema: await recordedSchema(dbName),
        tables: await tableNames(dbName)
    })

    const recordedSchema = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version WHERE version = 1', [dbName]
        )
        return rows[0]
    }

    const messageIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.message ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }

    const rowCounts = async dbName => {
        const [[{messages}]] = await admin.query('SELECT COUNT(*) AS messages FROM ??.message', [dbName])
        const [[{notifications}]] = await admin.query('SELECT COUNT(*) AS notifications FROM ??.notification', [dbName])
        return {messages, notifications}
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

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.schema.sql')
const DEPLOYED_QUALIFIED_MD5 = 'b58338efdcd4ee31e1aa2991055fd8fa'
