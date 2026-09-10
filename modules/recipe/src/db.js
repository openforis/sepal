import {createDb, createPool} from '#sepal/db/mysql'

import {migrateRecipeDb} from './databaseMigrations.js'

const DATABASE_NAME = 'recipe'

export const initializeDb = async () => {
    await migrateRecipeDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
