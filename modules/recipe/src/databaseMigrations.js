import {join} from 'node:path'

import {initDb, migrateDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

// Tests replace the import path to read a legacy source of their own; production reads processing_recipe.
export const migrateRecipeDb = async (dbName, {importPath = IMPORT_PATH} = {}) => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await migrateDb(dbName, importPath, {
        label: 'legacy-import migrations',
        schemaTable: 'legacy_import_version'
    })
}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const IMPORT_PATH = join(SCHEMA_PATH, 'legacy-import')
