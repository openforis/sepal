import {join} from 'path'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {initDatabase, migrateDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateRecipeDb = async (dbName, log) => {
    await initDatabase(dbName, SCHEMA_PATH, {
        label: 'schema migrations',
        beforeMigrate: async connection => {
            await reconcileMigrationHistory(connection, COMBINED_MIGRATION_TRANSITION, log)
            await reconcileMigrationHistory(connection, REVISION_MIGRATION_TRANSITION, log)
        }
    })
    await migrateDb(dbName, IMPORT_PATH, {
        label: 'legacy-import migrations',
        schemaTable: 'legacy_import_version'
    })
}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const IMPORT_PATH = join(SCHEMA_PATH, 'legacy-import')

// The deployed 001 both created the schema and copied the legacy data. A database that recorded its
// checksum is moved onto the schema-only file's, with the import recorded as already completed.
const COMBINED_SCHEMA_MD5 = '37b325f8ea33d8a4bd40052089a0abf9'
const SCHEMA_MD5 = '92f2b41a360311b6c6531c742cace8c2'
const LEGACY_IMPORT_MD5 = 'fc7dfdde3bd2c629a02016d64351c8fa'
const COMBINED_MIGRATION_TRANSITION = {
    version: 1,
    from: COMBINED_SCHEMA_MD5,
    to: SCHEMA_MD5,
    completedImport: {historyTable: 'legacy_import_version', version: 1, name: 'import', md5: LEGACY_IMPORT_MD5}
}

// 002 qualified its target with the database name, which only worked against the deployed `recipe`
// database. A database that recorded the qualified file is moved onto the portable one's checksum.
const QUALIFIED_REVISION_MD5 = 'b34d0a1633eeadec62bd60204ea11c8a'
const REVISION_MD5 = '6fccdf5fc9fdb2c20cf3ef6a88767aea'
const REVISION_MIGRATION_TRANSITION = {version: 2, from: QUALIFIED_REVISION_MD5, to: REVISION_MD5}
