import {createDb, createPool} from '#sepal/db/postgres'

import {migrateTaskManagerDb} from './databaseMigrations.js'

const DATABASE_NAME = 'task_manager'

export const initializeDb = async () => {
    await migrateTaskManagerDb(DATABASE_NAME)
    return createDb(await createPool(DATABASE_NAME))
}
