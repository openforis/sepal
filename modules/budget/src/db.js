import {createDb, createPool} from '#sepal/db/postgres'

import {migrateBudgetDb} from './databaseMigrations.js'

const DATABASE_NAME = 'budget'

export const initializeDb = async () => {
    await migrateBudgetDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
