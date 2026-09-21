import {randomBytes} from 'crypto'
import {cp, mkdtemp, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {createConnection, initDb, migrateDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('user database migrations', () => {
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
        const stored = await insertUser(dbName, aUser())

        const [found] = await admin.query('SELECT username FROM ??.sepal_user WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        expect(found).toEqual([{username: stored.username}])
        expect(collations).toEqual({
            sepal_user: 'ascii_general_ci'
        })
    })

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
    test('create the table with the credential and posix columns the repository writes', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const columns = await columnNames(dbName, 'sepal_user')
        expect(columns).toEqual(expect.arrayContaining(['password_hash', 'ssh_public_key', 'uid', 'gid']))
    })

    describe('002.do.revision.sql', () => {
        test('backfills every row that predates the column to revision 1', async () => {
            const dbName = await aDatabaseAtSchemaVersionOne()
            await insertUser(dbName, aUser({username: 'bob'}))
            await insertUser(dbName, aUser({username: 'alice'}))

            const {version} = await migrateDb(dbName, SCHEMA_PATH)

            const [rows] = await admin.query('SELECT username, revision FROM ??.sepal_user ORDER BY username', [dbName])
            expect(version).toBe(2)
            expect(rows).toEqual([{username: 'alice', revision: 1}, {username: 'bob', revision: 1}])
        })
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

    // Copy the real first migration unchanged so the full stream validates it before applying 002.
    const aDatabaseAtSchemaVersionOne = async () => {
        const dbName = await reserveDatabase()
        const firstVersionOnly = await mkdtemp(join(tmpdir(), 'user-schema-v1-'))
        try {
            await cp(join(SCHEMA_PATH, '001.do.schema.sql'), join(firstVersionOnly, '001.do.schema.sql'))
            await initDb(dbName, firstVersionOnly)
        } finally {
            await rm(firstVersionOnly, {recursive: true, force: true})
        }
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

// The email is unique in the schema, so it follows the username rather than being fixed.
const aUser = ({username = 'bob', ...over} = {}) => ({
    username, name: 'Bob', email: `${username}@example.org`, admin: 0, system_user: 0, status: 'ACTIVE',
    ...over
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
