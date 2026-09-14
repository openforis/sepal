import {randomBytes} from 'crypto'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('storage database migrations', () => {
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
        const stored = await insertRow(dbName, aRow())

        const [found] = await admin.query('SELECT username FROM ??.history WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        expect(found).toEqual([{username: stored.username}])
        expect(collations).toEqual({
            history: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create the history table in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['history']))
        })

        test('create an empty history table', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const ids = await storedIds(dbName)
            expect(ids).toEqual([])
        })
    })

    test('creates DropIndexIfExists with its database, table and index parameters', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const parameters = await procedureParameters(dbName, 'DropIndexIfExists')
        expect(parameters).toEqual(['dbName', 'tableName', 'indexName'])
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `storagemigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertRow = async (dbName, row) => {
        await admin.query('INSERT INTO ??.history SET ?', [dbName, row])
        return row
    }

    const storedIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.history ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }

    const procedureParameters = async (dbName, routine) => {
        const [rows] = await admin.query(`
            SELECT PARAMETER_NAME FROM information_schema.PARAMETERS
            WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ? ORDER BY ORDINAL_POSITION
        `, [dbName, routine])
        return rows.map(({PARAMETER_NAME}) => PARAMETER_NAME)
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

const aRow = () => ({
    id: 1, username: 'bob', event: 'USER_UP', timestamp: new Date('2026-01-01T00:00:00Z')
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
