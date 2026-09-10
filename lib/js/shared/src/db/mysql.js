import mysql from 'mysql2/promise'
import {join} from 'path'
import Postgrator from 'postgrator'

import {getLogger} from '#sepal/log'

const log = getLogger('database')

const {MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD} = process.env

const DEFAULT_CONNECTION_OPTIONS = {
    multipleStatements: false
}

const DEFAULT_POOL_OPTIONS = {
    connectionLimit: 5,
    multipleStatements: false
}

const getBaseProperties = dbName => {
    if (!MYSQL_HOST) {
        throw new Error('Missing MySQL host')
    }
    if (!MYSQL_USER) {
        throw new Error('Missing MySQL user')
    }
    if (!MYSQL_PASSWORD) {
        throw new Error('Missing MySQL password')
    }
    if (!dbName) {
        throw new Error('Missing MySQL database')
    }
    return {
        host: MYSQL_HOST,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: dbName
    }
}

export const createConnection = async (dbName, connectionOptions = {}) => {
    log.debug('Creating MySQL connection for database:', dbName)
    return await mysql.createConnection({
        ...getBaseProperties(dbName),
        ...DEFAULT_CONNECTION_OPTIONS,
        ...connectionOptions
    })
}

export const createPool = async (dbName, poolOptions = {}) => {
    log.debug('Creating MySQL pool for database:', dbName)
    return await mysql.createPool({
        ...getBaseProperties(dbName),
        ...DEFAULT_POOL_OPTIONS,
        ...poolOptions
    })
}

// One pooled connection per callback, handed back when the callback has finished with it and never
// beyond that. withTransaction brackets the callback in begin and commit and rolls back on any failure;
// withConnection only scopes the connection.
export const createDb = pool => ({
    withTransaction: callback => withTransaction(pool, callback),
    withConnection: callback => withConnection(pool, callback)
})

const withTransaction = async (pool, callback) => {
    const connection = await pool.getConnection()
    let reusable = true
    try {
        await connection.beginTransaction()
        const result = await callback(connection)
        await connection.commit()
        return result
    } catch (error) {
        reusable = await rolledBack(connection, error)
        throw error
    } finally {
        dispose(connection, reusable)
    }
}

const withConnection = async (pool, callback) => {
    const connection = await pool.getConnection()
    try {
        return await callback(connection)
    } finally {
        dispose(connection, true)
    }
}

// A failed rollback travels with the failure that caused it rather than replacing it, and leaves the
// connection's transaction state unknown, which makes that connection unfit for reuse.
const rolledBack = async (connection, error) => {
    try {
        await connection.rollback()
        return true
    } catch (rollbackError) {
        attach(error, 'rollbackError', rollbackError)
        return false
    }
}

// Disposal never fails the operation: what the callback did is what counts. Release is the way back to
// the pool; a connection unfit for reuse, or one that cannot be released, is destroyed instead.
const dispose = (connection, reusable) => {
    const released = reusable && succeeds(() => connection.release())
    if (!released) {
        succeeds(() => connection.destroy())
    }
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
        throw new Error('Missing MySQL database')
    }
    const connection = await createConnection('mysql')
    try {
        // Checked before the CREATE rather than read off its result: CREATE DATABASE IF NOT EXISTS
        // reports one affected row whether or not it created anything.
        const [rows] = await connection.query(`
            SELECT COUNT(*) AS count
            FROM information_schema.SCHEMATA
            WHERE SCHEMA_NAME = ?
        `, [dbName])
        const created = rows[0].count === 0
        // The charset is explicit because the server default is latin1, which a new schema would
        // otherwise inherit silently: mysql2 connects as utf8mb4, so the first non-Latin-1
        // character would be a hard error under STRICT_TRANS_TABLES.
        //
        // ascii_bin is the default because nearly everything SEPAL stores is machine-generated —
        // ids, tokens, api keys, uppercase state enums, AWS instance ids — where case is
        // significant and a byte comparison is what is actually wanted. Index keys, in-memory temp
        // tables and sort buffers are all sized from a column's MAXIMUM byte width, so utf8mb4
        // costs 4x on each even when the content is pure ASCII (it costs nothing extra on disk),
        // and ascii_bin is a plain memcmp, cheaper still than ascii_general_ci's case folding.
        //
        // There are two per-column opt-outs.
        //
        // Free human text — names, organizations, message and recipe contents:
        //     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci
        // The collation is spelled out because utf8mb4's own default here is utf8mb4_general_ci,
        // which — like utf8mb4_unicode_ci (UCA 4.0.0) — weighs every supplementary-plane character
        // identically and so compares any two emoji as equal. _520_ci (UCA 5.2.0) does not.
        //
        // Human-entered ASCII identifiers that must still compare case-insensitively:
        //     COLLATE ascii_general_ci
        // `sepal_user.email` and every `username` column. Both name a person rather than a
        // machine, and for both the case-insensitivity is what lets a UNIQUE index reject
        // case-differing duplicates directly, without a LOWER() wrapper that would suppress it.
        // Usernames are still written lowercase, but that is now a tidiness convention rather
        // than the thing correctness rests on: the comparison no longer depends on it. Both are
        // per-column COLLATE clauses in each module's schema migration — the schema default below
        // stays ascii_bin, which is still right for everything else.
        //
        // Existing schemas keep whatever charset they have — IF NOT EXISTS makes the clause a
        // no-op for them.
        await connection.execute(`
            CREATE DATABASE IF NOT EXISTS ${dbName}
            DEFAULT CHARACTER SET ascii COLLATE ascii_bin
        `)
        log.info(`${dbName}: database ${created ? 'created' : 'exists'}`)
        return created
    } finally {
        await connection.end()
    }
}

// A schema previously migrated by a Java module carries a Flyway history table that happens to share
// Postgrator's default name (`schema_version`), identifiable by its Flyway-specific `installed_rank`
// column. Before Postgrator can lay down its own baseline (migration 0) on such a schema, that table
// must be moved aside to `<schemaTable>_old`. This is a one-time, pre-migration-0 step: it can only
// fire while the history table is still Flyway's — once Postgrator owns it (no `installed_rank`), the
// schema is past migration 0 and this is a no-op. Reuses the migration connection.
const renameLegacyFlywayHistoryTableBeforeBaseline = async (connection, dbName, schemaTable) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'installed_rank'`,
        [dbName, schemaTable]
    )
    if (rows[0].count > 0) {
        await connection.query(`DROP TABLE IF EXISTS \`${schemaTable}_old\``)
        await connection.query(`RENAME TABLE \`${schemaTable}\` TO \`${schemaTable}_old\``)
        log.info(`Renamed legacy Flyway history table ${schemaTable} to ${schemaTable}_old in database ${dbName} (before migration 0)`)
    }
}

export const postgratorOptions = ({path, database, schemaTable = 'schema_version', execQuery}) => ({
    migrationPattern: join(path, '*'),
    driver: 'mysql',
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

    const connection = await createConnection(dbName, {multipleStatements: true})

    try {
        // Before Postgrator reads its history / applies migration 0, move aside any legacy Flyway
        // history table that would otherwise collide with Postgrator's own. One-time, pre-baseline.
        await renameLegacyFlywayHistoryTableBeforeBaseline(connection, dbName, historyTable)

        const postgrator = new Postgrator(postgratorOptions({
            path,
            database: dbName,
            schemaTable,
            execQuery: query => connection.query(query).then(([rows]) => ({rows}))
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
        await connection.end()
    }
}

export const initDb = async (dbName, migrationsPath, options = {}) => {
    const created = await ensureDatabaseExists(dbName)
    const {migrated, version} = await migrateDb(dbName, migrationsPath, options)
    return {created, migrated, version}
}
