// TEST SUPPORT — never import from production code.
//
// Provisions one database for a test suite: creates it, applies the production migrations, and hands
// back an adapter connected as an account that can reach nothing else. Between tests the suite restores
// the post-migration baseline; at the end it removes only what it created.
//
// Provisioning and the code under test use separate identities on purpose. The suite's account holds
// data privileges on its own database alone, so a qualified statement that names another database is
// refused by MySQL rather than silently reaching it.

import {randomBytes} from 'crypto'

import {createConnection, createDb, createPool, initDb} from '../../db/mysql.js'

// A metadata lock waits a year by default, so a transaction leaked by a previous test would hang the
// reset instead of failing it.
const RESET_LOCK_TIMEOUT_SECONDS = 5

export const createTestDb = async ({name, migrations, connections = 1}) => {
    const dbName = `${name}_${randomBytes(6).toString('hex')}`
    const account = {
        username: `t_${randomBytes(6).toString('hex')}`,
        password: randomBytes(12).toString('hex')
    }
    const cleanups = []
    let provisioner

    // The caller never receives a half-built database: anything created before a failure is removed here.
    try {
        provisioner = await createConnection('mysql')
        cleanups.push(() => provisioner.end())
        await provisioner.query(`SET SESSION lock_wait_timeout = ${RESET_LOCK_TIMEOUT_SECONDS}`)
        await createDatabase(provisioner, dbName)
        cleanups.push(() => provisioner.query(`DROP DATABASE IF EXISTS \`${dbName}\``))
        await initDb(dbName, migrations)
        await createUser(provisioner, account)
        cleanups.push(() => provisioner.query('DROP USER IF EXISTS ?@\'%\'', [account.username]))
        await grantOwnDatabaseOnly(provisioner, account, dbName)
        const baseline = await captureBaseline(provisioner, dbName)
        const pool = await ownPool(dbName, account, connections)
        cleanups.push(() => pool.end())
        return testDb({dbName, account, provisioner, pool, baseline, cleanups})
    } catch (error) {
        // Everything created so far is still removed, but the failure that got us here is the one
        // worth reporting.
        await runCleanups(cleanups).catch(() => {})
        throw error
    }
}

const testDb = ({dbName, account, provisioner, pool, baseline, cleanups}) => {
    // A reset that fails leaves the database in an unknown state, so every way into it fails with the
    // same error rather than running against whatever survived. Only removal stays available.
    let unusable = null

    const usable = () => {
        if (unusable) {
            throw unusable
        }
    }

    const db = createDb(pool)

    return {
        dbName,
        db: {
            withTransaction: async callback => {
                usable()
                return await db.withTransaction(callback)
            },
            withConnection: async callback => {
                usable()
                return await db.withConnection(callback)
            }
        },
        query: async (sql, params) => {
            usable()
            return await pool.query(sql, params)
        },
        withAnotherConnection: async callback => {
            usable()
            const connection = await createConnection(dbName, credentials(account))
            try {
                return await callback(connection)
            } finally {
                await connection.end()
            }
        },
        reset: async () => {
            usable()
            try {
                await restoreBaseline(provisioner, dbName, baseline)
            } catch (error) {
                unusable = error
                throw error
            }
        },
        remove: () => runCleanups(cleanups)
    }
}

// Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database someone
// else owns, so only databases this suite created are ever dropped.
const createDatabase = (provisioner, dbName) =>
    provisioner.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)

const createUser = (provisioner, {username, password}) =>
    provisioner.query('CREATE USER ?@\'%\' IDENTIFIED BY ?', [username, password])

const grantOwnDatabaseOnly = (provisioner, {username}, dbName) =>
    provisioner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${escapedDatabasePattern(dbName)}\`.* TO ?@'%'`,
        [username]
    )

// The driver's option is `user`, so the account cannot be spread in as it is named here.
const credentials = ({username, password}) => ({user: username, password})

// `_` and `%` are wildcards in the database part of a grant, so an unescaped name would also match
// look-alike databases.
const escapedDatabasePattern = dbName => dbName.replace(/[_%]/g, '\\$&')

// `connections` is only ever a count. Queueing stays off at every count, so an acquisition beyond what
// the suite asked for fails at once instead of waiting: a leaked connection, or an operation that opened
// one more than it should, is a visible failure rather than a hang. One is right for everything except a
// scenario whose writers must genuinely run at the same time.
const ownPool = (dbName, account, connections) => {
    if (!Number.isInteger(connections) || connections < 1) {
        throw new Error(`A test database needs a positive whole number of connections, got ${connections}`)
    }
    return createPool(dbName, {
        ...credentials(account),
        connectionLimit: connections,
        waitForConnections: false
    })
}

const captureBaseline = async (provisioner, dbName) => {
    await rejectUnsupportedStructures(provisioner, dbName)
    const [tables] = await provisioner.query(`
        SELECT TABLE_NAME, AUTO_INCREMENT FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
    `, [dbName])
    return await Promise.all(tables.map(async ({TABLE_NAME: table, AUTO_INCREMENT: autoIncrement}) => {
        const [rows] = await provisioner.query('SELECT * FROM ??.??', [dbName, table])
        return {table, autoIncrement, rows}
    }))
}

// Restoring a baseline row by row cannot reproduce structures whose contents depend on other rows or on
// statements. Rather than disable them and quietly change what the schema means, refuse them.
const rejectUnsupportedStructures = async (provisioner, dbName) => {
    const [[found]] = await provisioner.query(`
        SELECT
            (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = ?) AS foreignKeys,
            (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?) AS triggers,
            (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND EXTRA LIKE '%GENERATED%') AS generatedColumns,
            (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?) AS views
    `, [dbName, dbName, dbName, dbName])
    const unsupported = Object.entries(found).filter(([, count]) => count > 0).map(([kind]) => kind)
    if (unsupported.length) {
        throw new Error(`${dbName}: cannot restore a baseline for a schema containing ${unsupported.join(', ')}`)
    }
}

const restoreBaseline = async (provisioner, dbName, baseline) => {
    for (const {table} of baseline) {
        await provisioner.query('TRUNCATE TABLE ??.??', [dbName, table])
    }
    for (const {table, rows} of baseline) {
        for (const row of rows) {
            await provisioner.query('INSERT INTO ??.?? SET ?', [dbName, table, row])
        }
    }
    for (const {table, autoIncrement} of baseline) {
        if (autoIncrement != null) {
            // The counter is part of the baseline: truncating restarts it at 1, which is only correct
            // when the baseline itself started there.
            await provisioner.query(
                `ALTER TABLE \`${dbName}\`.\`${table}\` AUTO_INCREMENT = ${Number(autoIncrement)}`
            )
        }
    }
}

// Every remaining resource is attempted even when one step fails, and the first failure is reported.
const runCleanups = async cleanups => {
    let failure = null
    for (const cleanup of cleanups.splice(0).reverse()) {
        try {
            await cleanup()
        } catch (error) {
            failure = failure ?? error
        }
    }
    if (failure) {
        throw failure
    }
}
