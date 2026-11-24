import {join} from 'node:path'

import pg from 'pg'
import Postgrator from 'postgrator'

import {getLogger} from '#sepal/log'

const log = getLogger('database')

const {POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD} = process.env

const DEFAULT_POOL_OPTIONS = {
    max: 5
}

const UNIQUE_VIOLATION = '23505'
const DUPLICATE_DATABASE = '42P04'

// pg leaves int8 as a string, since it can exceed what a Number holds exactly; COUNT(*) and every
// bigint column are int8. Values beyond the safe range fail the query rather than being silently
// rounded. numeric stays a string, timestamptz becomes a Date and jsonb is parsed: pg's defaults.
pg.types.setTypeParser(pg.types.builtins.INT8, value => {
    const number = Number(value)
    if (!Number.isSafeInteger(number)) {
        throw new RangeError(`int8 ${value} is beyond the safe integer range`)
    }
    return number
})

const getBaseProperties = dbName => {
    if (!POSTGRES_HOST) {
        throw new Error('Missing Postgres host')
    }
    if (!POSTGRES_USER) {
        throw new Error('Missing Postgres user')
    }
    if (!POSTGRES_PASSWORD) {
        throw new Error('Missing Postgres password')
    }
    if (!dbName) {
        throw new Error('Missing Postgres database')
    }
    return {
        host: POSTGRES_HOST,
        user: POSTGRES_USER,
        password: POSTGRES_PASSWORD,
        database: dbName
    }
}

export const createConnection = async (dbName, connectionOptions = {}) => {
    log.debug('Creating Postgres connection for database:', dbName)
    const client = new pg.Client({
        ...getBaseProperties(dbName),
        ...connectionOptions
    })
    client.on('error', logConnectionError(dbName))
    await client.connect()
    return client
}

export const createPool = async (dbName, poolOptions = {}) => {
    log.debug('Creating Postgres pool for database:', dbName)
    const pool = new pg.Pool({
        ...getBaseProperties(dbName),
        ...DEFAULT_POOL_OPTIONS,
        ...poolOptions
    })
    pool.on('connect', client => client.on('error', logConnectionError(dbName)))
    // Already logged by the client: for an idle client the pool reports it again, having discarded it.
    pool.on('error', () => {})
    return pool
}

// The server can end a connection at any time, on a restart or by an administrator's hand, and an
// 'error' event nobody listens to crashes the process. The connection's queries fail with it, and the
// pool discards a client in that state when it is released.
const logConnectionError = dbName => error =>
    log.warn(`${dbName}: Postgres connection failed:`, error.message)

export const isUniqueViolation = error => error?.code === UNIQUE_VIOLATION

// One pooled client per callback, handed back when the callback has finished with it and never
// beyond that. withTransaction brackets the callback in begin and commit and rolls back on any failure;
// withConnection only scopes the client.
export const createDb = pool => ({
    withTransaction: callback => withTransaction(pool, callback),
    withConnection: callback => withConnection(pool, callback)
})

const withTransaction = async (pool, callback) => {
    const client = await pool.connect()
    let reusable = true
    try {
        await client.query('BEGIN')
        const result = await callback(client)
        await commit(client)
        return result
    } catch (error) {
        reusable = await rolledBack(client, error)
        throw error
    } finally {
        dispose(client, reusable)
    }
}

const withConnection = async (pool, callback) => {
    const client = await pool.connect()
    try {
        return await callback(client)
    } finally {
        dispose(client, true)
    }
}

// Postgres aborts a transaction on any failed statement, and a later COMMIT then succeeds as a ROLLBACK.
// A callback that caught such a failure must not pass for one whose work was committed.
const commit = async client => {
    const {command} = await client.query('COMMIT')
    if (command === 'ROLLBACK') {
        throw new Error('Transaction aborted by a failed statement and rolled back: nothing was committed')
    }
}

// A failed rollback travels with the failure that caused it rather than replacing it, and leaves the
// client's transaction state unknown, which makes that client unfit for reuse.
const rolledBack = async (client, error) => {
    try {
        await client.query('ROLLBACK')
        return true
    } catch (rollbackError) {
        attach(error, 'rollbackError', rollbackError)
        return false
    }
}

// Disposal never fails the operation: what the callback did is what counts. Releasing with a truthy
// argument makes the pool discard the client instead of keeping it for reuse.
const dispose = (client, reusable) => {
    succeeds(() => client.release(!reusable))
}

// A callback may throw anything at all, a frozen error or a primitive, so recording on it is best effort.
const attach = (error, name, value) => {
    try {
        error[name] = value
    } catch (_error) {
        // Nowhere to record it.
    }
}

const succeeds = action => {
    try {
        action()
        return true
    } catch (_error) {
        return false
    }
}

const ensureDatabaseExists = async dbName => {
    log.debug(`Ensuring database ${dbName} exists...`)
    if (!dbName) {
        throw new Error('Missing Postgres database')
    }
    const client = await createConnection('postgres')
    try {
        const {rowCount} = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
        const created = rowCount === 0 && await createDatabase(client, dbName)
        log.info(`${dbName}: database ${created ? 'created' : 'exists'}`)
        return created
    } finally {
        await client.end()
    }
}

// Created from template1, the default template, which carries the cluster's builtin C.UTF-8 locale.
// Another process can create the same database between the check and the CREATE: Postgres reports
// that as a duplicate database, or, when both CREATEs are in flight at once, as a unique violation
// on pg_database itself.
const createDatabase = async (client, dbName) => {
    try {
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`)
        return true
    } catch (error) {
        if ([DUPLICATE_DATABASE, UNIQUE_VIOLATION].includes(error.code)) {
            return false
        }
        throw error
    }
}

export const postgratorOptions = ({path, database, schemaTable = 'schema_version', execQuery}) => ({
    migrationPattern: join(path, '*'),
    driver: 'pg',
    database,
    schemaTable,
    execQuery
})

// Migrates a database that already exists; initDb creates it first. `label` only names the
// stream in log messages, so a database carrying several streams reads as "checking schema
// migrations" and "checking legacy-import migrations" rather than by history table.
export const migrateDb = async (dbName, path, {schemaTable, label} = {}) => {
    if (!path) {
        throw new Error('Cannot migrate database - missing path')
    }

    const historyTable = schemaTable || 'schema_version'
    const stream = label || historyTable

    log.info(`${dbName}: checking ${stream}`)

    const client = await createConnection(dbName)

    try {
        // Postgrator neither locks nor tolerates a concurrent run creating its history table, so
        // processes migrating the same stream take turns. The lock is scoped to this database and
        // released when the connection ends.
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [historyTable])

        const postgrator = new Postgrator(postgratorOptions({
            path,
            database: dbName,
            schemaTable,
            execQuery: query => client.query(query)
        }))

        const maxVersion = Number(await postgrator.getMaxVersion())
        const currentVersion = Number(await postgrator.getDatabaseVersion())
        if (maxVersion > currentVersion) {
            await postgrator.migrate()
            log.info(`${dbName}: ${stream} applied from version ${currentVersion} to ${maxVersion}`)
            return {migrated: true, version: maxVersion}
        } else {
            await postgrator.validateMigrations(currentVersion)
            log.info(`${dbName}: ${stream} validated; already at version ${currentVersion}`)
            return {migrated: false, version: currentVersion}
        }
    } finally {
        await client.end()
    }
}

export const initDb = async (dbName, migrationsPath, options = {}) => {
    const created = await ensureDatabaseExists(dbName)
    const {migrated, version} = await migrateDb(dbName, migrationsPath, options)
    return {created, migrated, version}
}
