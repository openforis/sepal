import {join} from 'node:path'

import {createDb, createPool, initDb} from '#sepal/db/postgres'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'worker'

export const initializeDb = async () => {
    await initDb(DATABASE_NAME, join(dirName(import.meta.url), '../migrations'), {label: 'schema migrations'})
    const db = createDb(await createPool(DATABASE_NAME))
    log.info('Database initialized')
    return db
}
