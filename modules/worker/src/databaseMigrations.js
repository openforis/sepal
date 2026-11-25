import {join} from 'node:path'

import {CONTENTS, importFromMysql} from '#sepal/db/mysqlImport'
import {initDb} from '#sepal/db/postgres'
import {dirName} from '#sepal/path'

export const migrateWorkerDb = async dbName => {
    await initDb(dbName, SCHEMA_PATH, {label: 'schema migrations'})
    await importFromMysql({dbName, sourceDb: SOURCE_DB, sqlPath: IMPORT_SQL, fingerprint: FINGERPRINT})
}

const SOURCE_DB = 'worker'
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
export const IMPORT_SQL = join(SCHEMA_PATH, 'mysql-import.sql')
// The expiry transitions and ratchets move deadlines and notification state without update_time,
// setClient changes a session_app owner without creation_time, and the rollup overwrites hourly rows in
// place. Samples are only inserted and pruned. instance_claim is small enough to hash.
export const FINGERPRINT = {
    worker_session: CONTENTS,
    instance_claim: CONTENTS,
    session_app: CONTENTS,
    instance_usage_sample: 'sample_time',
    instance_usage_hourly: CONTENTS
}
