import {join} from 'path'

import {createConnection, createPool, initDatabase} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'user'

const WAIT_INTERVAL_MS = 2000
const WAIT_TIMEOUT_MS = 5 * 60 * 1000

const __dirname = dirName(import.meta.url)
const migrationsPath = join(__dirname, '/../migrations')

const state = {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Connect to the always-present system schema: MySQL may still be starting, and on a fresh
// install the module's own schema does not exist yet.
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

const initializeDatabase = async () => {
    await waitForDatabase()
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
