import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateMessageDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'message'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// removeMessage updates a message without advancing update_time, so both tables are hashed in full.
export const FINGERPRINT = {message: CONTENTS, notification: CONTENTS}
