import {createDb, createPool} from '#sepal/db/mysql'

import {migrateBudgetDb} from './databaseMigrations.js'

const DATABASE_NAME = 'budget'

export const initializeDb = async () => {
    await migrateBudgetDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
