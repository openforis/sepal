import {join} from 'path'

import {createDb, createPool, initDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

const DATABASE_NAME = 'user_storage'

export const initializeDb = async () => {
    await initDb(DATABASE_NAME, join(dirName(import.meta.url), '../migrations'), {label: 'schema migrations'})
    return createDb(await createPool(DATABASE_NAME))
}
