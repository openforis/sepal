import {join} from 'node:path'

import {createDb, createPool, initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

const DATABASE_NAME = 'scene'

export const initializeDb = async () => {
    const {created} = await initDb(DATABASE_NAME, join(dirName(import.meta.url), '../migrations'), {label: 'schema migrations'})
    const db = createDb(await createPool(DATABASE_NAME))
    return {db, created}
}
