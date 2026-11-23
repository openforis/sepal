import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateTaskManagerDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'task_manager'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// remove() sets removed without advancing update_time, so the table is hashed in full.
export const FINGERPRINT = {task: CONTENTS}
