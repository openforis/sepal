import {join} from 'path'

import {createConnection, createPool, initDatabase} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'sepal_user'
const BASE_TABLE = 'sepal_user'
const SCHEMA_TABLE = 'schema_version_user_node'

const WAIT_INTERVAL_MS = 2000
const WAIT_TIMEOUT_MS = 5 * 60 * 1000

const __dirname = dirName(import.meta.url)
const migrationsPath = join(__dirname, '/../migrations')

const state = {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const baseTableExists = async () => {
    const connection = await createConnection(DATABASE_NAME)
    try {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [DATABASE_NAME, BASE_TABLE]
        )
        return rows[0].count > 0
    } finally {
        connection.end()
    }
}

const waitForBaseTable = async () => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS
    while (Date.now() < deadline) {
        try {
            if (await baseTableExists()) {
                return
            }
            log.info(`Waiting for ${DATABASE_NAME}.${BASE_TABLE} to be created by the user module...`)
        } catch (error) {
            log.info(`Waiting for database ${DATABASE_NAME} to be reachable...`, error.message)
        }
        await sleep(WAIT_INTERVAL_MS)
    }
    throw new Error(`Timed out waiting for ${DATABASE_NAME}.${BASE_TABLE}`)
}

const initializeDatabase = async () => {
    await waitForBaseTable()
    await initDatabase(DATABASE_NAME, migrationsPath, {schemaTable: SCHEMA_TABLE})
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
