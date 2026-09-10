import {join} from 'path'

import {initDb, migrateDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateWorkerDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await migrateDb(dbName, IMPORT_PATH, {
        label: 'legacy-import migrations',
        schemaTable: 'legacy_import_version'
    })
}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const IMPORT_PATH = join(SCHEMA_PATH, 'legacy-import')
