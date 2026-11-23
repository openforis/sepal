import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateUserDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'user'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// Logins stamp last_login_time and token rotation leaves update_time alone, so both tables are hashed in full.
export const FINGERPRINT = {sepal_user: CONTENTS, ssh_key: CONTENTS}
