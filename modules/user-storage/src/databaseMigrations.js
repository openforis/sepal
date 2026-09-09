import {join} from 'path'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {initDb} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

export const migrateUserStorageDb = (dbName, log) =>
    initDb(dbName, MIGRATIONS_PATH, {
        label: 'schema migrations',
        beforeMigrate: connection => reconcileMigrationHistory(connection, QUALIFIED_MIGRATION_TRANSITION, log)
    })

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')

// The deployed 001 qualified its table, procedure and index references with the database name; the
// portable file leaves them unqualified and its callers pass DATABASE(). There is no legacy import.
const QUALIFIED_SCHEMA_MD5 = 'f6f94238851600e662877ceebb830a60'
const SCHEMA_MD5 = '44d7dd9b075eb78308b02106e3490f14'
const QUALIFIED_MIGRATION_TRANSITION = {
    version: 1,
    from: QUALIFIED_SCHEMA_MD5,
    to: SCHEMA_MD5
}
