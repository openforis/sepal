import {createDb, createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateRecipeDb} from './databaseMigrations.js'

const DATABASE_NAME = 'recipe'

export const initializeDb = async () => {
    await migrateRecipeDb(DATABASE_NAME, getLogger('database'))
    return createDb(await createPool(DATABASE_NAME))
}
