import {createDb, createPool} from '#sepal/db/postgres'

import {migrateMessageDb} from './databaseMigrations.js'

const DATABASE_NAME = 'message'

export const initializeDb = async () => {
    await migrateMessageDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
