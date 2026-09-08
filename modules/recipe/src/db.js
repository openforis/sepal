import {createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateRecipeDb} from './databaseMigrations.js'

const log = getLogger('database')

export const DATABASE_NAME = 'recipe'

const state = {}

export const initializeDb = async () => {
    await migrateRecipeDb(DATABASE_NAME, log)
    state.pool = await createPool(DATABASE_NAME)
    log.info('Database initialized')
}

export const getPool = () => {
    if (state.pool) {
        return state.pool
    }
    throw new Error('Connection to database unavailable')
}
