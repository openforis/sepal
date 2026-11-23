import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateRecipeDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'recipe'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// Removing, moving and type-migrating a recipe leave update_time alone, and project has no timestamp,
// so both tables are hashed in full.
export const FINGERPRINT = {recipe: CONTENTS, project: CONTENTS}
