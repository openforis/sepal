import {createDb, createPool} from '#sepal/db/mysql'
import {getLogger} from '#sepal/log'

import {migrateWorkerDb} from './databaseMigrations.js'

const log = getLogger('database')

const DATABASE_NAME = 'worker'

export const initializeDb = async () => {
    await migrateWorkerDb(DATABASE_NAME)
    const db = createDb(await createPool(DATABASE_NAME))
    log.info('Database initialized')
    return db
}
