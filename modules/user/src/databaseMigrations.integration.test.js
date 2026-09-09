import {createHash, randomBytes} from 'crypto'
import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateUserDb} from './databaseMigrations.js'

describe('user database migrations', () => {
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
        test('create the sepal_user table in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['sepal_user']))
        })

        test('create them empty, importing nothing', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const usernames = await storedUsernames(dbName)
            expect(usernames).toEqual([])
        })
    })

    // Guarantees the old text-based contract test made about the schema file, now read from the database
    // the migration actually builds.
    test('create the table at its full shape, with no follow-up column migration', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const columns = await columnNames(dbName, 'sepal_user')
        expect(columns).toEqual(expect.arrayContaining(['password_hash', 'ssh_public_key', 'uid', 'gid']))
    })

    test('leave identities to start from one, and create no legacy relics', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const stored = await insertUser(dbName, aUser())
        const [rows] = await admin.query('SELECT id FROM ??.sepal_user WHERE username = ?', [dbName, stored.username])
        const tables = await tableNames(dbName)
        expect(rows[0].id).toBe(1)
        expect(tables).toEqual(['schema_version', 'sepal_user'])
    })

    describe('startup on a database migrated by the deployed file', () => {
        test('corrects the checksum and records the import as completed, keeping the users', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFile()
            const user = await insertUser(dbName, aUser())
            const deployed = await recordedSchema(dbName)

            await migrateUserDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const imports = await recordedImports(dbName)
            const usernames = await storedUsernames(dbName)
            expect(usernames).toEqual([user.username])
            expect(schema).toEqual({...deployed, md5: await checksum(SCHEMA_FILE)})
            expect(imports).toEqual([
                {version: 1, name: 'import', md5: await checksum(IMPORT_FILE), run_at: deployed.run_at}
            ])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFile()
            await insertUser(dbName, aUser())
            await migrateUserDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateUserDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateUserDb(dbName, log)

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
        const dbName = `usermigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertUser = async (dbName, user) => {
        await admin.query('INSERT INTO ??.sepal_user SET ?', [dbName, user])
        return user
    }

    const recordSchemaChecksum = (dbName, md5) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, md5])

    const databaseState = async dbName => ({
        users: await storedUsernames(dbName),
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

    const storedUsernames = async dbName => {
        const [rows] = await admin.query('SELECT username FROM ??.sepal_user ORDER BY username', [dbName])
        return rows.map(({username}) => username)
    }

    const columnNames = async (dbName, table) => {
        const [rows] = await admin.query(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
            [dbName, table]
        )
        return rows.map(({COLUMN_NAME}) => COLUMN_NAME)
    }

    const tableNames = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [dbName]
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }
})

const aUser = () => ({
    username: 'bob', name: 'Bob', email: 'bob@example.org', admin: 0, system_user: 0, status: 'ACTIVE'
})

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.schema.sql')
const IMPORT_FILE = join(SCHEMA_PATH, 'legacy-import/001.do.import.sql')
const DEPLOYED_SCHEMA_MD5 = '96f5a95e8f787253d9df39eb650ca897'
