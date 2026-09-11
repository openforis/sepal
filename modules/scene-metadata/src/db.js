import {join} from 'path'

import {createDb, createPool, initDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

const CURRENT_DATABASE_NAME = 'scene_metadata'

export const initializeDb = async () => {
    const {created} = await initDb(CURRENT_DATABASE_NAME, join(dirName(import.meta.url), '../migrations'), {label: 'schema migrations'})
    const db = createDb(await createPool(CURRENT_DATABASE_NAME))
    return {db, created}
}
