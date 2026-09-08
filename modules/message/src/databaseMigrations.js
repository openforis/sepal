import {join} from 'path'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {initDatabase} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateMessageDb = (dbName, log) =>
    initDatabase(dbName, MIGRATIONS_PATH, {
        label: 'schema migrations',
        beforeMigrate: connection => reconcileMigrationHistory(connection, QUALIFIED_MIGRATION_TRANSITION, log)
    })

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')

// The deployed 001 created the `message` schema and qualified every table with it. A database that
// recorded its checksum is moved onto the portable file's.
const QUALIFIED_SCHEMA_MD5 = 'b58338efdcd4ee31e1aa2991055fd8fa'
const SCHEMA_MD5 = '853d29548aa5114ccd0c67bb650cd7de'
const QUALIFIED_MIGRATION_TRANSITION = {version: 1, from: QUALIFIED_SCHEMA_MD5, to: SCHEMA_MD5}
