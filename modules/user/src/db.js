import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, createPool, initDatabase} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'sepal_user'
const BASE_TABLE = 'sepal_user'

const WAIT_INTERVAL_MS = 2000
const WAIT_TIMEOUT_MS = 5 * 60 * 1000

const __dirname = dirName(import.meta.url)
const migrationsPath = join(__dirname, '/../migrations')
const baseSchemaPath = join(__dirname, 'sql/base-schema.sql')

const state = {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Connect to the always-present system schema: MySQL may still be starting, and on a fresh
// install sepal_user does not exist yet.
const waitForDatabase = async () => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS
    for (;;) {
        try {
            const connection = await createConnection('mysql')
            connection.end()
            return
        } catch (error) {
            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting for MySQL to be reachable: ${error.message}`, {cause: error})
            }
            log.info('Waiting for MySQL to be reachable...', error.message)
            await sleep(WAIT_INTERVAL_MS)
        }
    }
}

// The module owns sepal_user end to end: on a fresh install, create the database and the base
// table from the bundled DDL (its full current shape, so migration 001's column adds no-op).
// Existing installs: guarded, no-op.
const ensureBaseSchema = async () => {
    const connection = await createConnection('mysql')
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`)
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [DATABASE_NAME, BASE_TABLE]
        )
        if (rows[0].count === 0) {
            const ddl = await readFile(baseSchemaPath, 'utf8')
            await connection.query(ddl)
            log.info(`Created base schema ${DATABASE_NAME}.${BASE_TABLE} (fresh install)`)
        }
    } finally {
        connection.end()
    }
}

const initializeDatabase = async () => {
    await waitForDatabase()
    await ensureBaseSchema()
    await initDatabase(DATABASE_NAME, migrationsPath)
    state.pool = await createPool(DATABASE_NAME)
    log.info('Database initialized')
}

const getPool = () => {
    if (state.pool) {
        return state.pool
    }
    throw new Error('Connection to database unavailable')
}

const createMigrationPool = () => createPool(DATABASE_NAME)

export {createMigrationPool, DATABASE_NAME, getPool, initializeDatabase}
