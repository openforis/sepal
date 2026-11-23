import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('worker import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'worker_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'worker_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const session = aSession({
            timeout_time: new Date('2026-01-02T04:00:00Z'),
            last_interaction_time: new Date('2026-01-02T03:30:00Z'),
            active_time: new Date('2026-01-02T03:05:00Z'),
            notification_state: 'EMAILED',
            notified_time: new Date('2026-01-02T04:01:00Z'),
            api_key: 'the-key'
        })
        const claim = aClaim()
        const app = anApp({label: 'Café 😀 漢字', client_id: 'a-client'})
        const sample = aSample()
        const hour = anHour()
        await seed('worker_session', session)
        await seed('instance_claim', claim)
        await seed('session_app', app)
        await seed('instance_usage_sample', sample)
        await seed('instance_usage_hourly', hour)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await imported(target, 'worker_session'), [session])
        assert.deepEqual(await imported(target, 'instance_claim'), [claim])
        assert.deepEqual(await imported(target, 'session_app'), [app])
        assert.deepEqual(await imported(target, 'instance_usage_sample'), [sample])
        assert.deepEqual(await imported(target, 'instance_usage_hourly'), [hour])
    })

    test('refuses to start after a change to worker_session', async () => {
        const session = aSession({notification_state: 'NOTIFIED', notified_time: new Date('2026-01-02T04:01:00Z')})
        await seed('worker_session', session)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE worker_session SET notification_state = ? WHERE id = ?', ['DISMISSED', session.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to instance_claim', async () => {
        const claim = aClaim()
        await seed('instance_claim', claim)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE instance_claim SET session_id = ? WHERE instance_id = ?', ['another-session', claim.instance_id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to session_app', async () => {
        const app = anApp()
        await seed('session_app', app)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE session_app SET client_id = ? WHERE app_path = ?', ['another-client', app.app_path])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a sample is recorded', async () => {
        const sample = aSample()
        await seed('instance_usage_sample', sample)
        await importFromMysql(importOf(source, target))
        await seed('instance_usage_sample', aSample({sample_time: new Date(sample.sample_time.getTime() + 60_000)}))

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to instance_usage_hourly', async () => {
        const hour = anHour()
        await seed('instance_usage_hourly', hour)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE instance_usage_hourly SET cpu_avg = ? WHERE session_id = ?', [99, hour.session_id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    // Timestamps travel as epoch milliseconds, so the seeded instant does not depend on the session zone.
    const seed = (table, row) => {
        const columns = Object.keys(row)
        const values = columns.map(column => row[column] instanceof Date ? 'FROM_UNIXTIME(? / 1000)' : '?')
        return source.query(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
            columns.map(column => row[column] instanceof Date ? row[column].getTime() : row[column])
        )
    }
})

const aSession = overrides => ({
    id: 'a-session',
    state: 'ACTIVE',
    username: 'alice',
    worker_type: 'SANDBOX',
    instance_type: 'T3aSmall',
    instance_id: 'i-1',
    instance_name: 'amber-lake',
    host: 'host-1',
    creation_time: new Date('2026-01-02T03:04:05Z'),
    update_time: new Date('2026-01-02T03:05:06Z'),
    timeout_time: null,
    last_interaction_time: null,
    active_time: null,
    notification_state: 'NONE',
    notified_time: null,
    api_key: null,
    ...overrides
})

const aClaim = overrides => ({
    instance_id: 'i-1',
    session_id: 'a-session',
    claimed_at: new Date('2026-01-02T03:04:07Z'),
    ...overrides
})

const anApp = overrides => ({
    username: 'alice',
    app_path: '/apps/first',
    session_id: 'a-session',
    label: 'An app',
    client_id: null,
    creation_time: new Date('2026-01-02T03:06:00Z'),
    ...overrides
})

const aSample = overrides => ({
    session_id: 'a-session',
    username: 'alice',
    instance_type: 'G5Xlarge',
    sample_time: new Date('2026-01-02T03:10:00Z'),
    cpu_pct: '12.34',
    ram_bytes: 8589934592,
    ram_pct: '50.00',
    gpu_pct: '99.99',
    gpu_ram_bytes: 4294967296,
    net_rx_bytes_per_s: 100,
    net_tx_bytes_per_s: 200,
    ...overrides
})

const anHour = overrides => ({
    session_id: 'a-session',
    username: 'alice',
    instance_type: 'G5Xlarge',
    hour: new Date('2026-01-02T03:00:00Z'),
    sample_count: 60,
    cpu_avg: '12.35',
    cpu_max: '80.00',
    ram_avg: '40.50',
    ram_max: '60.25',
    gpu_avg: '10.01',
    gpu_max: '100.00',
    gpu_ram_max: 4294967296,
    net_avg_bytes_per_s: 3000000000,
    ...overrides
})

const importOf = (source, target) => ({
    dbName: target.dbName,
    sourceDb: source.dbName,
    sqlPath: IMPORT_SQL,
    fingerprint: FINGERPRINT,
    mysql: {
        host: process.env.MYSQL_FDW_HOST ?? process.env.MYSQL_HOST,
        user: source.account.username,
        password: source.account.password
    }
})

const imported = async (target, table) => {
    const {rows} = await target.query(`SELECT * FROM ${table}`)
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
