import {join} from 'node:path'

import {importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateStorageDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'storage'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// history is append-only: addEvent only inserts.
export const FINGERPRINT = {history: 'id'}
