import {createDb, createPool} from '#sepal/db/postgres'

import {migrateStorageDb} from './databaseMigrations.js'

const DATABASE_NAME = 'storage'

export const initializeDb = async () => {
    await migrateStorageDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
