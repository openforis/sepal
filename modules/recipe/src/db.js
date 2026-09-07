import {join} from 'path'

import {createPool, initDatabase} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

const DATABASE_NAME = 'recipe'

const migrationsPath = join(dirName(import.meta.url), '/../migrations')

const initializeDatabase = async () => {
    await initDatabase(DATABASE_NAME, migrationsPath)
    return await createPool(DATABASE_NAME)
}

export {initializeDatabase}
