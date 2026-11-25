import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('budget import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'budget_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'budget_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const userBudget = aUserBudget()
        const defaultBudget = {monthly_instance: 1, monthly_storage: 2, storage_quota: 3}
        const monthlyStorage = aMonthlyStorage()
        const spending = aSpending()
        const request = aRequest({message: 'Más espacio 😀 漢字'})
        const openUse = anOpenSessionUse()
        const closedUse = anOpenSessionUse({session_id: 'closed', to_time: new Date('2026-06-02T03:04:05Z')})
        await seedUserBudget(userBudget)
        await seedDefaultBudget(defaultBudget)
        await seedMonthlyStorage(monthlyStorage)
        await seedSpending(spending)
        await seedRequest(request)
        await seedOpenSessionUse(openUse)
        await seedOpenSessionUse(closedUse)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await imported(target, 'user_budget', 'username'), [userBudget])
        assert.deepEqual(await imported(target, 'default_user_budget', 'monthly_instance'), [defaultBudget])
        assert.deepEqual(await imported(target, 'user_monthly_storage', 'username'), [monthlyStorage])
        assert.deepEqual(await imported(target, 'user_spending', 'username'), [spending])
        assert.deepEqual(await imported(target, 'budget_update_request', 'id'), [request])
        assert.deepEqual(await imported(target, 'open_session_use', 'session_id'), [closedUse, openUse])
    })

    test('refuses to start after a change to user_budget', async () => {
        await seedUserBudget(aUserBudget())
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE user_budget SET monthly_instance = 99')

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to default_user_budget', async () => {
        await seedDefaultBudget({monthly_instance: 1, monthly_storage: 2, storage_quota: 3})
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE default_user_budget SET monthly_instance = 99')

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to user_spending', async () => {
        await seedSpending(aSpending())
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE user_spending SET instance_spending = 99')

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to open_session_use', async () => {
        await seedOpenSessionUse(anOpenSessionUse())
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE open_session_use SET to_time = from_time')

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    const seedUserBudget = ({username, monthly_instance, monthly_storage, storage_quota}) =>
        source.query(
            'INSERT INTO user_budget (username, monthly_instance, monthly_storage, storage_quota) VALUES (?, ?, ?, ?)',
            [username, monthly_instance, monthly_storage, storage_quota]
        )

    const seedDefaultBudget = ({monthly_instance, monthly_storage, storage_quota}) =>
        source.query(
            'INSERT INTO default_user_budget (monthly_instance, monthly_storage, storage_quota) VALUES (?, ?, ?)',
            [monthly_instance, monthly_storage, storage_quota]
        )

    const seedMonthlyStorage = ({username, year, month, gb_hours, storage_used, update_time}) =>
        source.query(
            `INSERT INTO user_monthly_storage (username, year, month, gb_hours, storage_used, update_time)
             VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))`,
            [username, year, month, gb_hours, storage_used, update_time.getTime()]
        )

    const seedSpending = ({username, instance_spending, storage_spending, storage_usage}) =>
        source.query(
            'INSERT INTO user_spending (username, instance_spending, storage_spending, storage_usage) VALUES (?, ?, ?, ?)',
            [username, instance_spending, storage_spending, storage_usage]
        )

    const seedRequest = request =>
        source.query(
            `INSERT INTO budget_update_request
                (id, username, state, message, initial_monthly_instance, initial_monthly_storage, initial_storage_quota,
                 requested_monthly_instance, requested_monthly_storage, requested_storage_quota,
                 final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000))`,
            [
                request.id, request.username, request.state, request.message,
                request.initial_monthly_instance, request.initial_monthly_storage, request.initial_storage_quota,
                request.requested_monthly_instance, request.requested_monthly_storage, request.requested_storage_quota,
                request.final_monthly_instance, request.final_monthly_storage, request.final_storage_quota,
                request.creation_time.getTime(), request.update_time.getTime()
            ]
        )

    const seedOpenSessionUse = ({session_id, username, instance_type, from_time, to_time}) =>
        source.query(
            `INSERT INTO open_session_use (session_id, username, instance_type, from_time, to_time)
             VALUES (?, ?, ?, FROM_UNIXTIME(? / 1000), ${to_time ? 'FROM_UNIXTIME(? / 1000)' : '?'})`,
            [session_id, username, instance_type, from_time.getTime(), to_time ? to_time.getTime() : null]
        )
})

const aUserBudget = () => ({username: 'alice', monthly_instance: 10, monthly_storage: 20, storage_quota: 30})

const aMonthlyStorage = () => ({
    username: 'alice',
    year: 2026,
    month: 6,
    gb_hours: 12.5,
    storage_used: 3.25,
    update_time: new Date('2026-06-10T01:02:03Z')
})

const aSpending = () => ({username: 'alice', instance_spending: 1.5, storage_spending: 2.5, storage_usage: 3.5})

const aRequest = overrides => ({
    id: 'a-request',
    username: 'alice',
    state: 'CLOSED',
    message: 'More please',
    initial_monthly_instance: 1,
    initial_monthly_storage: 2,
    initial_storage_quota: 3,
    requested_monthly_instance: 4,
    requested_monthly_storage: 5,
    requested_storage_quota: 6,
    final_monthly_instance: 7,
    final_monthly_storage: 8,
    final_storage_quota: 9,
    creation_time: new Date('2026-01-02T03:04:05Z'),
    update_time: new Date('2026-02-03T04:05:06Z'),
    ...overrides
})

const anOpenSessionUse = overrides => ({
    session_id: 'open',
    username: 'alice',
    instance_type: 't2.small',
    from_time: new Date('2026-06-01T00:00:00Z'),
    to_time: null,
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

const imported = async (target, table, orderBy) => {
    const {rows} = await target.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`)
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
