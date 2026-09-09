import {join} from 'path'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {initDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateSceneMetadataDb = (dbName, log) =>
    initDb(dbName, MIGRATIONS_PATH, {
        label: 'schema migrations',
        beforeMigrate: connection => reconcileMigrationHistory(connection, QUALIFIED_MIGRATION_TRANSITION, log)
    })

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')

// The deployed 001 created the database and qualified its table with it. A database that recorded its
// checksum moves onto the portable file's. Nothing is imported: the table holds derived data that the
// ingester rebuilds.
const QUALIFIED_SCHEMA_MD5 = '38a9a7d2a27224f23407230282b8c010'
const SCHEMA_MD5 = 'a0a72f29c24c8230a1a3740ff5146b6c'
const QUALIFIED_MIGRATION_TRANSITION = {version: 1, from: QUALIFIED_SCHEMA_MD5, to: SCHEMA_MD5}
