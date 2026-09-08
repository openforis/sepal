// Temporary rollout compatibility, kept apart from the permanent runner in mysql.js: when a reviewed
// reorganization changes an already-applied migration file, a database that recorded the previous
// checksum is brought onto the current one before Postgrator validates it. A module hooks this into
// the runner's beforeMigrate with a transition description it owns:
//
//     {
//         version,            the migration whose file changed
//         from,               the checksum its previous file recorded
//         to,                 the checksum its current file has
//         historyTable,       defaults to 'schema_version'
//         completedImport     optional {historyTable, version, name, md5}: an import that the previous
//                             file performed and that now lives in its own stream, to be recorded as
//                             already completed so that stream never runs it again
//     }
//
// Remove once the last caller has completed its cutover.

export const reconcileMigrationHistory = async (connection, transition, log) => {
    const {historyTable = 'schema_version', version, from, to, completedImport} = transition
    const dbName = await currentDbName(connection)

    if (!await tableExists(connection, historyTable)) {
        return
    }
    const record = await recordedMigration(connection, historyTable, version)
    if (!record || record.md5 === to) {
        return
    }
    if (record.md5 !== from) {
        throw new Error(
            `${dbName}: MD5 checksum failed for migration [${version}] in ${historyTable}: `
            + `recorded ${record.md5} is neither the previous nor the current checksum`
        )
    }
    if (completedImport) {
        // MySQL commits DDL implicitly, so the table must exist before the transaction that fills it.
        await createHistoryTable(connection, completedImport.historyTable)
    }
    if (await correctUnderRowLock(connection, {historyTable, version, from, to, completedImport})) {
        log.info(`${dbName}: ${describeCorrection({historyTable, version, completedImport})}`)
    }
}

const correctUnderRowLock = async (connection, {historyTable, version, from, to, completedImport}) => {
    await connection.beginTransaction()
    try {
        const [rows] = await connection.query(
            'SELECT md5 FROM ?? WHERE version = ? FOR UPDATE', [historyTable, version]
        )
        const recognized = rows[0]?.md5 === from
        if (recognized) {
            if (completedImport) {
                await recordCompletedImport(connection, historyTable, version, completedImport)
            }
            await connection.query('UPDATE ?? SET md5 = ? WHERE version = ?', [historyTable, to, version])
        }
        await connection.commit()
        return recognized
    } catch (error) {
        await rollbackQuietly(connection)
        throw error
    }
}

const recordCompletedImport = (connection, historyTable, version, {historyTable: importTable, ...record}) =>
    connection.query(`
        INSERT INTO ?? (version, name, md5, run_at)
        SELECT ?, ?, ?, run_at FROM ?? WHERE version = ?
    `, [importTable, record.version, record.name, record.md5, historyTable, version])

const describeCorrection = ({historyTable, version, completedImport}) =>
    `recognized migration ${version} in ${historyTable} by its previous checksum; checksum corrected`
    + (completedImport
        ? ` and ${completedImport.historyTable} ${completedImport.version} recorded as already completed`
        : '')

const currentDbName = async connection => {
    const [[{name}]] = await connection.query('SELECT DATABASE() AS name')
    return name
}

const tableExists = async (connection, table) => {
    const [rows] = await connection.query(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]
    )
    return rows.length > 0
}

const recordedMigration = async (connection, historyTable, version) => {
    const [rows] = await connection.query('SELECT md5 FROM ?? WHERE version = ?', [historyTable, version])
    return rows[0]
}

// Postgrator's own layout, so the stream this table belongs to validates the record like any other.
const createHistoryTable = (connection, table) => connection.query(`
    CREATE TABLE IF NOT EXISTS ?? (
        version BIGINT PRIMARY KEY,
        name TEXT,
        md5 TEXT,
        run_at TIMESTAMP NULL
    ) ENGINE=InnoDB
`, [table])

const rollbackQuietly = async connection => {
    try {
        await connection.rollback()
    } catch (_error) {
        // The failure that triggered the rollback is the one worth reporting.
    }
}
