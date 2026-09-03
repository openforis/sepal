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

const getBaseProperties = database => {
    if (!MYSQL_HOST) {
        throw new Error('Missing MySQL host')
    }
    if (!MYSQL_USER) {
        throw new Error('Missing MySQL user')
    }
    if (!MYSQL_PASSWORD) {
        throw new Error('Missing MySQL password')
    }
    if (!database) {
        throw new Error('Missing MySQL database')
    }
    return {
        host: MYSQL_HOST,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database
    }
}

export const createConnection = async (database, connectionOptions = {}) => {
    log.debug('Creating MySQL connection for database:', database)
    return await mysql.createConnection({
        ...getBaseProperties(database),
        ...DEFAULT_CONNECTION_OPTIONS,
        ...connectionOptions
    })
}

export const createPool = async (database, poolOptions = {}) => {
    log.debug('Creating MySQL pool for database:', database)
    return await mysql.createPool({
        ...getBaseProperties(database),
        ...DEFAULT_POOL_OPTIONS,
        ...poolOptions
    })
}

const ensureDatabaseExists = async database => {
    log.debug(`Ensuring database ${database} exists...`)
    if (!database) {
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
        `, [database])
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
        // Only sepal_user.email needs this, and it is why that column can keep a UNIQUE index that
        // rejects case-differing duplicates. `username` deliberately does NOT: it is lowercased on
        // input and on migration, so ascii_bin is exact and its unique index is usable directly,
        // without a LOWER() wrapper that would suppress it.
        //
        // Existing schemas keep whatever charset they have — IF NOT EXISTS makes the clause a
        // no-op for them.
        await connection.execute(`
            CREATE DATABASE IF NOT EXISTS ${database}
            DEFAULT CHARACTER SET ascii COLLATE ascii_bin
        `)
        log.info(`Ensured database ${database} exists`)
        return created
    } finally {
        connection.end()
    }
}

// A schema previously migrated by a Java module carries a Flyway history table that happens to share
// Postgrator's default name (`schema_version`), identifiable by its Flyway-specific `installed_rank`
// column. Before Postgrator can lay down its own baseline (migration 0) on such a schema, that table
// must be moved aside to `<schemaTable>_old`. This is a one-time, pre-migration-0 step: it can only
// fire while the history table is still Flyway's — once Postgrator owns it (no `installed_rank`), the
// schema is past migration 0 and this is a no-op. Reuses the migration connection.
const renameLegacyFlywayHistoryTableBeforeBaseline = async (connection, database, schemaTable) => {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'installed_rank'`,
        [database, schemaTable]
    )
    if (rows[0].count > 0) {
        await connection.query(`DROP TABLE IF EXISTS \`${schemaTable}_old\``)
        await connection.query(`RENAME TABLE \`${schemaTable}\` TO \`${schemaTable}_old\``)
        log.info(`Renamed legacy Flyway history table ${schemaTable} to ${schemaTable}_old in database ${database} (before migration 0)`)
    }
}

export const postgratorOptions = ({path, database, schemaTable = 'schema_version', execQuery}) => ({
    migrationPattern: join(path, '*'),
    driver: 'mysql',
    database,
    schemaTable,
    execQuery
})

const migrateDatabase = async (database, path, schemaTable) => {
    log.debug(`Applying migrations to database ${database}`)

    if (!path) {
        throw new Error('Cannot migrate database - missing path')
    }

    const historyTable = schemaTable || 'schema_version'

    const connection = await createConnection(database, {multipleStatements: true})

    try {
        // Before Postgrator reads its history / applies migration 0, move aside any legacy Flyway
        // history table that would otherwise collide with Postgrator's own. One-time, pre-baseline.
        await renameLegacyFlywayHistoryTableBeforeBaseline(connection, database, historyTable)

        const postgrator = new Postgrator(postgratorOptions({
            path,
            database,
            schemaTable,
            execQuery: query => connection.query(query).then(([rows]) => ({rows}))
        }))

        const maxVersion = Number(await postgrator.getMaxVersion())
        const currentVersion = Number(await postgrator.getDatabaseVersion())
        if (maxVersion > currentVersion) {
            await postgrator.migrate()
            log.info(`Applied migrations to database ${database}, updated from version ${currentVersion} to ${maxVersion}`)
            return {migrated: true, version: maxVersion}
        } else {
            log.info(`Skipped migrations to database ${database}, already on version ${currentVersion}`)
            return {migrated: false, version: currentVersion}
        }
    } finally {
        connection.end()
    }
}

export const initDatabase = async (database, migrationsPath, {schemaTable} = {}) => {
    const created = await ensureDatabaseExists(database)
    const {migrated, version} = await migrateDatabase(database, migrationsPath, schemaTable)
    return {created, migrated, version}
}
