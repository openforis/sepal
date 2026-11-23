import {join} from 'node:path'

import {createConnection, createDb, createPool, initDb} from '#sepal/db/postgres'
import {getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'

const log = getLogger('database')

const DATABASE_NAME = 'user'

const WAIT_INTERVAL_MS = 2000
const WAIT_TIMEOUT_MS = 5 * 60 * 1000

export const initializeDb = async () => {
    await waitForDatabase()
    await initDb(DATABASE_NAME, join(dirName(import.meta.url), '../migrations'), {label: 'schema migrations'})
    const db = createDb(await createPool(DATABASE_NAME))
    log.info('Database initialized')
    return db
}

// Connect to the always-present system database: Postgres may still be starting, and on a fresh
// install the module's own database does not exist yet.
const waitForDatabase = async () => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS
    for (;;) {
        try {
            const connection = await createConnection('postgres')
            connection.end()
            return
        } catch (error) {
            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting for Postgres to be reachable: ${error.message}`, {cause: error})
            }
            log.info('Waiting for Postgres to be reachable...', error.message)
            await sleep(WAIT_INTERVAL_MS)
        }
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
