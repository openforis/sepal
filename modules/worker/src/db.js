import {createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateWorkerDb} from './databaseMigrations.js'

const log = getLogger('database')

const DATABASE_NAME = 'worker'

const state = {}

const initializeDatabase = async () => {
    await migrateWorkerDb(DATABASE_NAME)
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
