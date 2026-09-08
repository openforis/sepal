import {createDb, createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateMessageDb} from './databaseMigrations.js'

const DATABASE_NAME = 'message'

export const initializeDb = async () => {
    await migrateMessageDb(DATABASE_NAME, getLogger('database'))
    return createDb(await createPool(DATABASE_NAME))
}
