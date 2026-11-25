import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateBudgetDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'budget'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// Every write to user_monthly_storage and budget_update_request sets update_time; the other tables
// are written without advancing any timestamp (or have none), so they are hashed in full.
export const FINGERPRINT = {
    user_budget: CONTENTS,
    default_user_budget: CONTENTS,
    user_monthly_storage: 'update_time',
    user_spending: CONTENTS,
    budget_update_request: 'update_time',
    open_session_use: CONTENTS
}
