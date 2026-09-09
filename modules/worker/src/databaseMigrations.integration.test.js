import {createHash, randomBytes} from 'crypto'
import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateWorkerDb} from './databaseMigrations.js'

describe('worker database migrations', () => {
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
        test('create the worker tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining([
                'instance', 'instance_usage_hourly', 'instance_usage_sample',
                'session_app', 'task', 'worker_session'
            ]))
        })

        test('create them empty, importing nothing', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const sessions = await sessionIds(dbName)
            expect(sessions).toEqual([])
        })
    })

    describe('startup on a database migrated by the deployed file', () => {
        test('corrects the checksum and records the import as completed, keeping the sessions', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFile()
            const session = await insertSession(dbName, aWorkerSession())
            const deployed = await recordedSchema(dbName)

            await migrateWorkerDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const imports = await recordedImports(dbName)
            const sessions = await sessionIds(dbName)
            expect(sessions).toEqual([session.id])
            expect(schema).toEqual({...deployed, md5: await checksum(SCHEMA_FILE)})
            expect(imports).toEqual([
                {version: 1, name: 'import', md5: await checksum(IMPORT_FILE), run_at: deployed.run_at}
            ])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFile()
            await insertSession(dbName, aWorkerSession())
            await migrateWorkerDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateWorkerDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateWorkerDb(dbName, log)

            await expect(startup).rejects.toThrow(/MD5 checksum failed/)
            const schema = await recordedSchema(dbName)
            const tables = await tableNames(dbName)
            expect(schema).toEqual(before)
            expect(tables).not.toContain('legacy_import_version')
        })
    })

    // The deployed file built the same tables this one builds; only its checksum differs. Recording it
    // is also what keeps the extracted import from running against the legacy source.
    const aDatabaseMigratedByTheDeployedFile = async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        await recordSchemaChecksum(dbName, DEPLOYED_SCHEMA_MD5)
        return dbName
    }

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

    const recordSchemaChecksum = (dbName, md5) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, md5])

    const databaseState = async dbName => ({
        sessions: await sessionIds(dbName),
        schema: await recordedSchema(dbName),
        imports: await recordedImports(dbName)
    })

    const recordedSchema = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version WHERE version = 1', [dbName]
        )
        return rows[0]
    }

    const recordedImports = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.legacy_import_version ORDER BY version', [dbName]
        )
        return rows
    }

    const sessionIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.worker_session ORDER BY id', [dbName])
        return rows.map(({id}) => id)
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
    instance_id: 'i-1', host: 'host', creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.schema.sql')
const IMPORT_FILE = join(SCHEMA_PATH, 'legacy-import/001.do.import.sql')
const DEPLOYED_SCHEMA_MD5 = '065cff2e0d25cc60314dc6ad518accb6'
