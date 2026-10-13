import {randomBytes} from 'node:crypto'
import {join} from 'node:path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('user-data database migrations', () => {
    let admin
    const reserved = []

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    test('create an empty data_usage table that compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        await admin.query('INSERT INTO ??.data_usage (username) VALUES (?)', [dbName, 'alice'])
        const [found] = await admin.query('SELECT username FROM ??.data_usage WHERE username = ?', [dbName, 'ALICE'])
        expect(found).toEqual([{username: 'alice'}])
        expect(await usernameCollations(dbName)).toEqual({data_usage: 'ascii_general_ci'})
    })

    test('create data_usage without rows', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const [rows] = await admin.query('SELECT username FROM ??.data_usage', [dbName])
        expect(rows).toEqual([])
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `userdatamigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const usernameCollations = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = ?',
            [dbName, 'username']
        )
        return Object.fromEntries(rows.map(({TABLE_NAME, COLLATION_NAME}) => [TABLE_NAME, COLLATION_NAME]))
    }
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
