import {createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateBudgetDb} from './databaseMigrations.js'

const log = getLogger('database')

const DATABASE_NAME = 'budget'

const state = {}

const initializeDatabase = async () => {
    await migrateBudgetDb(DATABASE_NAME)
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
