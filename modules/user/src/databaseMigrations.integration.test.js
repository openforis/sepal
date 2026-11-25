import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('user database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the sepal_user and ssh_key tables in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const tables = await tableNames(dbName)
        assert.ok(new Set(['sepal_user', 'ssh_key']).isSubsetOf(new Set(tables)))
    })

    test('creates the tables empty', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const {rows} = await query(dbName, 'SELECT username FROM sepal_user')
        assert.deepEqual(rows, [])
    })

    test('creates the table with the credential and posix columns the repository writes', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const columns = await columnNames(dbName, 'sepal_user')
        assert.ok(new Set(['password_hash', 'ssh_public_key', 'uid', 'gid', 'revision']).isSubsetOf(new Set(columns)))
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertUser(dbName, aUser())

        const found = await query(dbName, 'SELECT username FROM sepal_user WHERE username = $1', [stored.username.toUpperCase()])
        const duplicate = insertUser(dbName, aUser({username: stored.username.toUpperCase(), email: 'other@example.org'}))

        assert.deepEqual(found.rows, [{username: stored.username}])
        await assert.rejects(duplicate, isUniqueViolation)
    })

    test('rejects a second account whose email differs only in case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertUser(dbName, aUser())

        const duplicate = insertUser(dbName, aUser({username: 'alice', email: stored.email.toUpperCase()}))

        await assert.rejects(duplicate, isUniqueViolation)
    })

    test('compares ssh key usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        await insertSshKey(dbName, 'bob')

        const duplicate = insertSshKey(dbName, 'BOB')

        await assert.rejects(duplicate, isUniqueViolation)
    })

    test('stores emails with non-ASCII characters', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)

        const stored = await insertUser(dbName, aUser({email: 'ramón.cortés@example.org'}))

        const {rows} = await query(dbName, 'SELECT email FROM sepal_user WHERE username = $1', [stored.username])
        assert.deepEqual(rows, [{email: stored.email}])
    })

    test('starts identities from one and starts every row at revision 1', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)

        const stored = await insertUser(dbName, aUser())

        const {rows} = await query(dbName, 'SELECT id, revision FROM sepal_user WHERE username = $1', [stored.username])
        assert.deepEqual(rows, [{id: 1, revision: 1}])
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `user_migrations_test_${randomBytes(6).toString('hex')}`
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

    const insertUser = async (dbName, user) => {
        await query(
            dbName,
            `INSERT INTO sepal_user (username, name, email, admin, "system_user", status)
             VALUES ($1, $2, $3, false, false, 'ACTIVE')`,
            [user.username, user.name, user.email]
        )
        return user
    }

    const insertSshKey = (dbName, username) =>
        query(
            dbName,
            `INSERT INTO ssh_key (username, name, key_type, public_key, fingerprint)
             VALUES ($1, 'Laptop', 'ssh-ed25519', 'AAAA', 'SHA256:abc')`,
            [username]
        )

    const columnNames = async (dbName, table) => {
        const {rows} = await query(
            dbName,
            'SELECT column_name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = $1',
            [table]
        )
        return rows.map(({column_name}) => column_name)
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

// The email is unique in the schema, so it follows the username rather than being fixed.
const aUser = ({username = 'bob', ...over} = {}) => ({
    username, name: 'Bob', email: `${username}@example.org`, ...over
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
