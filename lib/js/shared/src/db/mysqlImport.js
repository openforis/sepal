import {readFile} from 'node:fs/promises'
import {isDeepStrictEqual} from 'node:util'

import {createConnection} from '#sepal/db/postgres'
import {getLogger} from '#sepal/log'

const log = getLogger('database')

const {MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD} = process.env

const DEFAULT_MYSQL = {host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASSWORD}

const SERVER = 'mysql_source_server'
const SCHEMA = 'mysql_source'

const UNABLE_TO_ESTABLISH_CONNECTION = 'HV00N'
const SCHEMA_NOT_FOUND = 'HV00Q'

// Fingerprints a table by a hash of every row, for tables some write leaves without an advanced column.
export const CONTENTS = Symbol('CONTENTS')

export class StaleImportError extends Error {
    constructor({sourceDb, dbName, importedAt}) {
        super(
            `${sourceDb} in MySQL changed after it was imported into Postgres database ${dbName} at ${importedAt.toISOString()}. `
            + `Dropping ${dbName} makes the import run again, and loses all writes made to ${dbName} since then. `
            + `Dump it before dropping it; postgres-backup keeps a nightly dump in \${SEPAL_BACKUP_DIR}/postgres/${dbName}.dump. `
            + 'See "Rollback and redeploy" in docs/database-migrations.md.'
        )
        this.name = 'StaleImportError'
    }
}

// The source lost the data it held at the import, so importing it again would discard Postgres' only copy.
export class MissingSourceError extends Error {
    constructor({sourceDb, dbName, importedAt, databaseAbsent}) {
        super(
            `${databaseAbsent ? `${sourceDb} is absent from MySQL or holds no tables` : `The tables of ${sourceDb} are absent or empty in MySQL`}, `
            + `but it was imported into Postgres database ${dbName} at ${importedAt.toISOString()}. `
            + 'If MySQL lost its data, restore it in MySQL, or unset MYSQL_HOST to stop checking. '
            + `Do not drop ${dbName}: an import of what MySQL holds now would discard all writes made to ${dbName}.`
        )
        this.name = 'MissingSourceError'
    }
}

// Copies a module's MySQL database into its migrated Postgres database once, and on every later start
// refuses to run when MySQL has changed since, as it does when a rolled-back build wrote to it. Everything
// happens in one transaction, so a failed import leaves nothing behind and a check leaves nothing at all.
// `fingerprint` names, per source table, the column whose maximum every write advances, or CONTENTS.
export const importFromMysql = async ({dbName, sourceDb, sqlPath, fingerprint, mysql = DEFAULT_MYSQL}) => {
    if (!mysql.host) {
        log.info(`${dbName}: no MySQL host configured, nothing to import`)
        return {outcome: 'skipped'}
    }
    validate(mysql)
    const client = await createConnection(dbName)
    try {
        await client.query('BEGIN')
        try {
            const outcome = await importOrVerify(client, {dbName, sourceDb, sqlPath, fingerprint, mysql})
            return {outcome}
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {})
            throw error
        }
    } finally {
        await client.end()
    }
}

const validate = ({user, password}) => {
    if (!user) {
        throw new Error('Missing MySQL user')
    }
    if (!password) {
        throw new Error('Missing MySQL password')
    }
}

const importOrVerify = async (client, {dbName, sourceDb, sqlPath, fingerprint, mysql}) => {
    await prepare(client)
    const record = await recordOf(client, sourceDb)
    await attachSource(client, mysql)
    return record
        ? await verify(client, {dbName, sourceDb, fingerprint, record})
        : await runImport(client, {dbName, sourceDb, sqlPath, fingerprint})
}

// The lock makes a second process starting at the same time wait, then find the record.
// mysql_fdw reads MySQL TIMESTAMP in a UTC MySQL session and parses it as timestamptz in this session's zone,
// so with the zone pinned to UTC the instant survives and import SQL copies TIMESTAMP columns as they are.
// A CONTENTS hash covers each row's text, so the settings that shape it are pinned to a stock server's values.
const prepare = async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext(\'mysql_import\'))')
    await client.query(`
        SET LOCAL timezone = 'UTC';
        SET LOCAL DateStyle = 'ISO, MDY';
        SET LOCAL IntervalStyle = 'postgres';
        SET LOCAL extra_float_digits = 1;
        SET LOCAL bytea_output = 'hex'
    `)
    await client.query(`
        CREATE TABLE IF NOT EXISTS mysql_import (
            source_db   text        PRIMARY KEY,
            fingerprint jsonb       NOT NULL,
            imported_at timestamptz NOT NULL
        )
    `)
}

const recordOf = async (client, sourceDb) => {
    const {rows: [record]} = await client.query(
        'SELECT fingerprint, imported_at AS "importedAt" FROM mysql_import WHERE source_db = $1',
        [sourceDb]
    )
    return record
}

// mysql_fdw otherwise talks MySQL's three-byte utf8, which turns every emoji into '?'.
const attachSource = async (client, {host, port = 3306, user, password}) => {
    await client.query(`
        CREATE SERVER ${SERVER} FOREIGN DATA WRAPPER mysql_fdw
        OPTIONS (host ${client.escapeLiteral(host)}, port ${client.escapeLiteral(String(port))}, character_set 'utf8mb4')
    `)
    await client.query(`
        CREATE USER MAPPING FOR CURRENT_USER SERVER ${SERVER}
        OPTIONS (username ${client.escapeLiteral(user)}, password ${client.escapeLiteral(password)})
    `)
    await client.query(`CREATE SCHEMA ${SCHEMA}`)
}

const verify = async (client, {dbName, sourceDb, fingerprint, record}) => {
    let current
    try {
        current = await sourceFingerprint(client, sourceDb, fingerprint)
    } catch (error) {
        if (error.code !== UNABLE_TO_ESTABLISH_CONNECTION) {
            throw error
        }
        await client.query('ROLLBACK')
        log.warn(`${dbName}: cannot reach MySQL to check that ${sourceDb} is unchanged since its import, starting unverified:`, error.message)
        return 'unverified'
    }
    await client.query('ROLLBACK')
    const {fingerprint: recorded, importedAt} = record
    if (isDeepStrictEqual(current ?? {}, recorded)) {
        log.info(`${dbName}: ${sourceDb} in MySQL is unchanged since its import`)
        return 'verified'
    }
    if (lostSince(recorded, current)) {
        throw new MissingSourceError({sourceDb, dbName, importedAt, databaseAbsent: !current})
    }
    throw new StaleImportError({sourceDb, dbName, importedAt})
}

// An import that found tables, checked against a source without them or without a single row in them.
const lostSince = (recorded, current) => {
    const tables = Object.keys(recorded)
    return tables.length > 0 && tables.every(table => !(current?.[table]?.count > 0))
}

const runImport = async (client, {dbName, sourceDb, sqlPath, fingerprint}) => {
    const present = (await importForeignSchema(client, sourceDb)).length > 0
    const recorded = present ? await fingerprintOf(client, fingerprint) : {}
    if (present) {
        await client.query(await readFile(sqlPath, 'utf8'))
    }
    await client.query(
        'INSERT INTO mysql_import (source_db, fingerprint, imported_at) VALUES ($1, $2, now())',
        [sourceDb, JSON.stringify(recorded)]
    )
    await detachSource(client)
    await commit(client)
    if (present) {
        log.info(`${dbName}: imported ${sourceDb} from MySQL`)
        return 'imported'
    }
    log.warn(`${dbName}: ${sourceDb} is absent or holds no tables in MySQL, recorded an empty import`)
    return 'empty'
}

// Null when the source database is absent or holds no tables; a table the source lacks has no mark.
const sourceFingerprint = async (client, sourceDb, fingerprint) => {
    const tables = await importForeignSchema(client, sourceDb)
    if (tables.length === 0) {
        return null
    }
    return await fingerprintOf(client, Object.fromEntries(
        Object.entries(fingerprint).filter(([table]) => tables.includes(table))
    ))
}

// MySQL reports a database the account cannot see as absent too; SEPAL's MySQL account sees them all.
const importForeignSchema = async (client, sourceDb) => {
    await client.query('SAVEPOINT import_foreign_schema')
    try {
        // Without import_enum_as_text, an ENUM column needs a Postgres type nobody created.
        await client.query(
            `IMPORT FOREIGN SCHEMA ${client.escapeIdentifier(sourceDb)} FROM SERVER ${SERVER} INTO ${SCHEMA}
             OPTIONS (import_enum_as_text 'true')`
        )
    } catch (error) {
        if (error.code !== SCHEMA_NOT_FOUND) {
            throw error
        }
        await client.query('ROLLBACK TO SAVEPOINT import_foreign_schema')
    }
    const {rows} = await client.query(`
        SELECT relname FROM pg_foreign_table
        JOIN pg_class ON pg_class.oid = ftrelid
        WHERE relnamespace = $1::regnamespace
    `, [SCHEMA])
    return rows.map(({relname}) => relname)
}

const fingerprintOf = async (client, fingerprint) => {
    const marks = {}
    for (const [table, column] of Object.entries(fingerprint)) {
        const {rows: [mark]} = await client.query(
            `SELECT count(*) AS count, ${markOf(client, column)} AS mark FROM ${SCHEMA}.${client.escapeIdentifier(table)} t`
        )
        marks[table] = mark
    }
    return marks
}

const markOf = (client, column) =>
    column === CONTENTS
        ? 'md5(string_agg(md5(t::text), \'\' ORDER BY md5(t::text)))'
        : `max(t.${client.escapeIdentifier(column)})::text`

const detachSource = async client => {
    await client.query(`DROP SCHEMA ${SCHEMA} CASCADE`)
    await client.query(`DROP USER MAPPING FOR CURRENT_USER SERVER ${SERVER}`)
    await client.query(`DROP SERVER ${SERVER}`)
}

// A statement that failed aborts the transaction, and COMMIT then succeeds as a ROLLBACK.
const commit = async client => {
    const {command} = await client.query('COMMIT')
    if (command === 'ROLLBACK') {
        throw new Error('MySQL import aborted by a failed statement and rolled back: nothing was imported')
    }
}
