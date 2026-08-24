import {join} from 'path'

import {createPool, initDatabase} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'message'

const __dirname = dirName(import.meta.url)
const migrationsPath = join(__dirname, '/../migrations')

const state = {}

const initializeDatabase = async () => {
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

export {DATABASE_NAME, getPool, initializeDatabase}
