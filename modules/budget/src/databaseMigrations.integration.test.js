import {randomBytes} from 'crypto'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('budget database migrations', () => {
    let admin
    const reserved = []

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertUserBudget(dbName, aUserBudget())

        const [found] = await admin.query('SELECT username FROM ??.user_budget WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        expect(found).toEqual([{username: stored.username}])
        expect(collations).toEqual({
            user_budget: 'ascii_general_ci',
            user_monthly_storage: 'ascii_general_ci',
            user_spending: 'ascii_general_ci',
            budget_update_request: 'ascii_general_ci',
            open_session_use: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create the budget tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining([
                'budget_update_request', 'default_user_budget', 'open_session_use',
                'user_budget', 'user_monthly_storage', 'user_spending'
            ]))
        })

        test('create them empty, importing nothing', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const budgets = await userBudgetUsernames(dbName)
            expect(budgets).toEqual([])
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `budgetmigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertUserBudget = async (dbName, budget) => {
        await admin.query('INSERT INTO ??.user_budget SET ?', [dbName, budget])
        return budget
    }

    const userBudgetUsernames = async dbName => {
        const [rows] = await admin.query('SELECT username FROM ??.user_budget ORDER BY username', [dbName])
        return rows.map(({username}) => username)
    }

    const usernameCollations = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = ?',
            [dbName, 'username']
        )
        return Object.fromEntries(rows.map(({TABLE_NAME, COLLATION_NAME}) => [TABLE_NAME, COLLATION_NAME]))
    }

    const tableNames = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [dbName]
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }
})

const aUserBudget = () => ({
    username: 'bob', monthly_instance: 10, monthly_storage: 20, storage_quota: 30
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
