import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('budget database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the budget tables in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const tables = await tableNames(dbName)
        assert.ok(new Set([
            'budget_update_request', 'default_user_budget', 'open_session_use',
            'user_budget', 'user_monthly_storage', 'user_spending'
        ]).isSubsetOf(new Set(tables)))
    })

    test('creates empty tables, importing nothing', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const budgets = await query(dbName, 'SELECT username FROM user_budget')
        assert.deepEqual(budgets.rows, [])
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertUserBudget(dbName, aUserBudget())

        const found = await query(dbName, 'SELECT username FROM user_budget WHERE username = $1', [stored.username.toUpperCase()])

        assert.deepEqual(found.rows, [{username: stored.username}])
    })

    test('rejects a user budget for a username that differs only in case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertUserBudget(dbName, aUserBudget())

        const duplicate = insertUserBudget(dbName, {...stored, username: stored.username.toUpperCase()})

        await assert.rejects(duplicate, isUniqueViolation)
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `budget_migrations_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(dbName)} OWNER ${admin.escapeIdentifier(process.env.POSTGRES_USER)}`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(dbName)} WITH (FORCE)`)
        }
    }

    const query = async (dbName, sql, params) => {
        const connection = await createConnection(dbName, {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
        try {
            return await connection.query(sql, params)
        } finally {
            await connection.end()
        }
    }

    const insertUserBudget = async (dbName, budget) => {
        await query(
            dbName,
            'INSERT INTO user_budget (username, monthly_instance, monthly_storage, storage_quota) VALUES ($1, $2, $3, $4)',
            [budget.username, budget.monthly_instance, budget.monthly_storage, budget.storage_quota]
        )
        return budget
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aUserBudget = () => ({
    username: 'bob', monthly_instance: 10, monthly_storage: 20, storage_quota: 30
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
