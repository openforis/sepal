import {createHash, randomBytes} from 'crypto'
import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateUserStorageDb} from './databaseMigrations.js'

describe('user storage database migrations', () => {
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

    // Reconciliation corrects a recorded checksum; it never recreates a routine. A database migrated by
    // the deployed file keeps the procedure it already has, so this interface has to stay as deployed or
    // the two would silently diverge.
    test('creates DropIndexIfExists with the interface deployed databases already have', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const parameters = await procedureParameters(dbName, 'DropIndexIfExists')
        expect(parameters).toEqual(['dbName', 'tableName', 'indexName'])
    })

    describe('startup on a database migrated by the deployed qualified file', () => {
        test('corrects the schema checksum, keeping the history rows', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            const stored = await insertRow(dbName, aRow())
            const qualified = await recordedSchema(dbName)

            await migrateUserStorageDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const ids = await storedIds(dbName)
            expect(ids).toEqual([stored.id])
            expect(schema).toEqual({...qualified, md5: await checksum(SCHEMA_FILE)})
        })

        test('creates no import history', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()

            await migrateUserStorageDb(dbName, log)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(['history', 'schema_version'])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            await insertRow(dbName, aRow())
            await migrateUserStorageDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateUserStorageDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateUserStorageDb(dbName, log)

            await expect(startup).rejects.toThrow(/MD5 checksum failed/)
            const schema = await recordedSchema(dbName)
            expect(schema).toEqual(before)
        })
    })

    // The qualified file built the same tables the portable file builds now; only its checksum differs.
    const aDatabaseMigratedByTheQualifiedFile = async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        await recordSchemaChecksum(dbName, DEPLOYED_QUALIFIED_MD5)
        return dbName
    }

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `userstoragemigrations_${randomBytes(6).toString('hex')}`
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

    const recordSchemaChecksum = (dbName, md5) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, md5])

    const databaseState = async dbName => ({
        rows: await storedIds(dbName),
        schema: await recordedSchema(dbName),
        tables: await tableNames(dbName)
    })

    const recordedSchema = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version WHERE version = 1', [dbName]
        )
        return rows[0]
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

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.sql')
const DEPLOYED_QUALIFIED_MD5 = 'f6f94238851600e662877ceebb830a60'
