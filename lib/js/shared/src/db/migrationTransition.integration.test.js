import {randomBytes} from 'crypto'

import {reconcileMigrationHistory} from '#sepal/db/migrationTransition'
import {createConnection} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {faultyConnection} from '#sepal/testSupport/db/faultyConnection'

describe('reconcileMigrationHistory', () => {
    let admin
    let connection
    let reports
    const reserved = []
    const log = {info: report => reports.push(report)}

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    beforeEach(async () => {
        reports = []
        connection = await createConnection(await reserveDatabase())
    })

    afterEach(async () => {
        await connection?.end()
        await dropReservedDatabases()
    })

    afterAll(() => admin?.end())

    test('leaves a database without migration history alone', async () => {
        await reconcileMigrationHistory(connection, aTransition(), log)

        const tables = await tableNames()
        expect(tables).toEqual([])
    })

    test('leaves a history that never recorded the migration alone', async () => {
        const baseline = aRecord({version: 0, name: null, md5: null, run_at: null})
        await givenHistory(baseline)

        await reconcileMigrationHistory(connection, aTransition(), log)

        const records = await history()
        expect(records).toEqual([baseline])
    })

    test('corrects the previous checksum, keeping the timestamp and later records', async () => {
        const previous = aRecord({md5: PREVIOUS_CHECKSUM})
        const later = aRecord({version: 2, md5: 'later-checksum', run_at: new Date('2026-02-01T00:00:00Z')})
        await givenHistory(previous, later)

        await reconcileMigrationHistory(connection, aTransition(), log)

        const records = await history()
        expect(records).toEqual([{...previous, md5: CURRENT_CHECKSUM}, later])
    })

    test('records the extracted import as completed at the time the migration ran', async () => {
        const previous = aRecord({md5: PREVIOUS_CHECKSUM})
        await givenHistory(previous)
        const completedImport = anImport()

        await reconcileMigrationHistory(connection, aTransition({completedImport}), log)

        const imports = await rowsOf(completedImport.historyTable)
        expect(imports).toEqual([{
            version: completedImport.version, name: completedImport.name, md5: completedImport.md5,
            run_at: previous.run_at
        }])
    })

    test('creates no import history for a transition without an import', async () => {
        await givenHistory(aRecord({md5: PREVIOUS_CHECKSUM}))

        await reconcileMigrationHistory(connection, aTransition(), log)

        const tables = await tableNames()
        expect(tables).toEqual(['schema_version'])
    })

    test('changes nothing once the checksum is current', async () => {
        const current = aRecord({md5: CURRENT_CHECKSUM})
        await givenHistory(current)

        await reconcileMigrationHistory(connection, aTransition(), log)

        const records = await history()
        expect(records).toEqual([current])
        expect(reports).toEqual([])
    })

    test.each(['unrecognized', null])('refuses to correct an unrecognized checksum: %p', async md5 => {
        const unrecognized = aRecord({md5})
        await givenHistory(unrecognized)

        const reconciliation = reconcileMigrationHistory(connection, aTransition(), log)

        await expect(reconciliation).rejects.toThrow(/MD5 checksum failed/)
        const records = await history()
        expect(records).toEqual([unrecognized])
    })

    test('rolls back the correction and the import record together when the update fails', async () => {
        const previous = aRecord({md5: PREVIOUS_CHECKSUM})
        await givenHistory(previous)
        const completedImport = anImport()
        const refusingTheCorrection = faultyConnection(connection, {
            when: theChecksumUpdate, error: new Error('history update refused')
        })

        const reconciliation = reconcileMigrationHistory(
            refusingTheCorrection, aTransition({completedImport}), log
        )

        await expect(reconciliation).rejects.toThrow('history update refused')
        const records = await history()
        expect(records).toEqual([previous])
        const imports = await rowsOf(completedImport.historyTable)
        expect(imports).toEqual([])
        expect(reports).toEqual([])
    })

    test('reports a committed correction once', async () => {
        await givenHistory(aRecord({md5: PREVIOUS_CHECKSUM}))

        await reconcileMigrationHistory(connection, aTransition(), log)
        await reconcileMigrationHistory(connection, aTransition(), log)

        expect(reports).toHaveLength(1)
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `migration_transition_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    // Postgrator's history layout, as the runner leaves it after a migration.
    const givenHistory = async (...records) => {
        await connection.query(`
            CREATE TABLE schema_version (version BIGINT PRIMARY KEY, name TEXT, md5 TEXT, run_at TIMESTAMP NULL)
        `)
        for (const record of records) {
            await connection.query('INSERT INTO schema_version SET ?', record)
        }
    }

    const history = () => rowsOf('schema_version')

    const rowsOf = async table => {
        const [rows] = await connection.query('SELECT version, name, md5, run_at FROM ?? ORDER BY version', [table])
        return rows
    }

    const tableNames = async () => {
        const [rows] = await connection.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }
})

const theChecksumUpdate = (sql, params) =>
    /UPDATE \?\? SET md5/.test(sql) && params[0] === 'schema_version'

const aTransition = overrides => ({version: 1, from: PREVIOUS_CHECKSUM, to: CURRENT_CHECKSUM, ...overrides})

const anImport = () => ({historyTable: 'import_version', version: 1, name: 'import', md5: 'import-checksum'})

const aRecord = overrides => ({
    version: 1, name: 'schema', md5: CURRENT_CHECKSUM, run_at: new Date('2026-01-01T00:00:00Z'), ...overrides
})

const PREVIOUS_CHECKSUM = 'previous-checksum'
const CURRENT_CHECKSUM = 'current-checksum'
