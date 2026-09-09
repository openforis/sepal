import {join} from 'path'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {initDb, migrateDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateWorkerDb = async (dbName, log) => {
    await initDb(dbName, SCHEMA_PATH, {
        label: 'schema migrations',
        beforeMigrate: connection => reconcileMigrationHistory(connection, COMBINED_MIGRATION_TRANSITION, log)
    })
    await migrateDb(dbName, IMPORT_PATH, {
        label: 'legacy-import migrations',
        schemaTable: 'legacy_import_version'
    })
}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const IMPORT_PATH = join(SCHEMA_PATH, 'legacy-import')

// The deployed 001 created the database, qualified its targets and copied the legacy data. A database
// that recorded its checksum is moved onto the schema-only file's, with the import recorded as done.
const COMBINED_SCHEMA_MD5 = '065cff2e0d25cc60314dc6ad518accb6'
const SCHEMA_MD5 = '66621aca2bb2c1d7b7b99c2f35f76203'
const LEGACY_IMPORT_MD5 = '60d0bb4b4011062f05a681306f9257a1'
const COMBINED_MIGRATION_TRANSITION = {
    version: 1,
    from: COMBINED_SCHEMA_MD5,
    to: SCHEMA_MD5,
    completedImport: {historyTable: 'legacy_import_version', version: 1, name: 'import', md5: LEGACY_IMPORT_MD5}
}
