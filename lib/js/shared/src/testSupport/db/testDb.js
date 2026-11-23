// TEST SUPPORT — never import from production code.
//
// Provisions one database for a test suite: creates it, applies the production migrations as the
// application role, and hands back an adapter connected as an account that can reach nothing else.
// Between tests the suite restores the post-migration baseline; at the end it removes only what it
// created.
//
// Provisioning and the code under test use separate identities on purpose. The suite's account may
// connect to its own database alone and holds data privileges on its tables only, so the code under test
// cannot touch another suite's data or change the schema it is tested against.

import {randomBytes} from 'node:crypto'

import {createConnection, createDb, createPool, initDb} from '../../db/postgres.js'

const SCHEMA = 'public'
const SUPERUSER = {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD}

// A lock waits forever by default, so a transaction leaked by a previous test would hang the reset
// instead of failing it.
const RESET_LOCK_TIMEOUT = '5s'

export const createTestDb = async ({name, migrations, connections = 1}) => {
    const dbName = `${name}_${randomBytes(6).toString('hex')}`
    const account = {
        username: `t_${dbName}`,
        password: randomBytes(12).toString('hex')
    }
    const cleanups = []

    // The caller never receives a half-built database: anything created before a failure is removed here.
    try {
        const provisioner = await createConnection('postgres', SUPERUSER)
        cleanups.push(() => provisioner.end())
        await createAccount(provisioner, account)
        cleanups.push(() => dropAccount(provisioner, account))
        await createDatabase(provisioner, dbName, account)
        cleanups.push(() => dropDatabase(provisioner, dbName))
        await initDb(dbName, migrations)
        const administrator = await createConnection(dbName, SUPERUSER)
        cleanups.push(() => administrator.end())
        await administrator.query(`SET lock_timeout = '${RESET_LOCK_TIMEOUT}'`)
        await grantOwnTablesOnly(administrator, account)
        const baseline = await captureBaseline(administrator, dbName)
        const pool = await ownPool(dbName, account, connections)
        cleanups.push(() => pool.end())
        return testDb({dbName, account, administrator, pool, connections, baseline, cleanups})
    } catch (error) {
        // Everything created so far is still removed, but the failure that got us here is the one
        // worth reporting.
        await runCleanups(cleanups).catch(() => {})
        throw error
    }
}

const testDb = ({dbName, account, administrator, pool, connections, baseline, cleanups}) => {
    // A reset that fails leaves the database in an unknown state, so every way into it fails with the
    // same error rather than running against whatever survived. Only removal stays available.
    let unusable = null

    const usable = () => {
        if (unusable) {
            throw unusable
        }
    }

    const db = createDb({connect: exclusiveConnect(pool, connections)})

    return {
        dbName,
        account,
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
            return await db.withConnection(client => client.query(sql, params))
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
                await restoreBaseline(administrator, baseline)
            } catch (error) {
                unusable = error
                throw error
            }
        },
        remove: () => runCleanups(cleanups)
    }
}

const createAccount = (provisioner, {username, password}) =>
    provisioner.query(
        `CREATE ROLE ${provisioner.escapeIdentifier(username)} LOGIN PASSWORD ${provisioner.escapeLiteral(password)}`
    )

const dropAccount = (provisioner, {username}) =>
    provisioner.query(`DROP ROLE IF EXISTS ${provisioner.escapeIdentifier(username)}`)

// Deliberately not checked for existence first: a name collision must fail rather than take over a
// database someone else owns, so only databases this suite created are ever dropped. The application role
// owns it, so the migrations run, and their tables are owned, as in production.
const createDatabase = async (provisioner, dbName, {username}) => {
    const database = provisioner.escapeIdentifier(dbName)
    await provisioner.query(`CREATE DATABASE ${database} OWNER ${provisioner.escapeIdentifier(process.env.POSTGRES_USER)}`)
    await provisioner.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`)
    await provisioner.query(`GRANT CONNECT ON DATABASE ${database} TO ${provisioner.escapeIdentifier(username)}`)
}

// Forced, so a connection the suite leaked cannot keep its database alive.
const dropDatabase = (provisioner, dbName) =>
    provisioner.query(`DROP DATABASE IF EXISTS ${provisioner.escapeIdentifier(dbName)} WITH (FORCE)`)

const grantOwnTablesOnly = async (administrator, {username}) => {
    const account = administrator.escapeIdentifier(username)
    await administrator.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${SCHEMA} TO ${account}`)
    await administrator.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SCHEMA} TO ${account}`)
}

// The driver's option is `user`, so the account cannot be spread in as it is named here.
const credentials = ({username, password}) => ({user: username, password})

const ownPool = (dbName, account, connections) => {
    if (!Number.isInteger(connections) || connections < 1) {
        throw new Error(`A test database needs a positive whole number of connections, got ${connections}`)
    }
    return createPool(dbName, {...credentials(account), max: connections})
}

// pg's pool queues an acquisition beyond its size, and its connection timeout also bounds opening a new
// connection, so neither can refuse at once. This counts acquisitions itself: one beyond what the suite
// asked for fails instead of waiting, so a leaked connection, or an operation that opened one more than it
// should, is a visible failure rather than a hang. One is right for everything except a scenario whose
// writers must genuinely run at the same time.
const exclusiveConnect = (pool, connections) => {
    let inUse = 0
    return async () => {
        if (inUse >= connections) {
            throw new Error(`All ${connections} test database connection(s) are in use`)
        }
        inUse++
        let client
        try {
            client = await pool.connect()
        } catch (error) {
            inUse--
            throw error
        }
        // The pool assigns release afresh on every acquisition, and rejects a second call itself.
        const release = client.release
        let released = false
        client.release = discard => {
            if (!released) {
                released = true
                inUse--
            }
            return release(discard)
        }
        return client
    }
}

const captureBaseline = async (administrator, dbName) => {
    await rejectUnsupportedStructures(administrator, dbName)
    const {rows: tables} = await administrator.query(
        'SELECT format(\'%I.%I\', schemaname, tablename) AS table FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
        [SCHEMA]
    )
    // Rows travel as Postgres' own JSON rendering and are read back by Postgres, never parsed by the driver,
    // so every value, timestamp microseconds and exact numerics included, comes back as it was.
    const contents = []
    for (const {table} of tables) {
        const {rows: [{rows}]} = await administrator.query(
            `SELECT coalesce(json_agg(t.*), '[]')::text AS rows FROM ${table} t`
        )
        contents.push({table, rows})
    }
    const {rows: sequences} = await administrator.query(`
        SELECT format('%I.%I', schemaname, sequencename) AS sequence,
               coalesce(last_value, start_value)::text AS value,
               last_value IS NOT NULL AS called
        FROM pg_sequences WHERE schemaname = $1
    `, [SCHEMA])
    return {tables: contents, sequences}
}

// Restoring a baseline row by row cannot reproduce structures whose contents depend on other rows or on
// statements. Rather than disable them and quietly change what the schema means, refuse them.
const rejectUnsupportedStructures = async (administrator, dbName) => {
    const {rows: [found]} = await administrator.query(`
        SELECT
            (SELECT count(*) FROM information_schema.referential_constraints
             WHERE constraint_schema = $1) AS "foreignKeys",
            (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = $1) AS triggers,
            (SELECT count(*) FROM information_schema.columns
             WHERE table_schema = $1 AND is_generated = 'ALWAYS') AS "generatedColumns",
            (SELECT count(*) FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
             WHERE nspname = $1 AND relkind IN ('v', 'm')) AS views
    `, [SCHEMA])
    const unsupported = Object.entries(found).filter(([, count]) => count > 0).map(([kind]) => kind)
    if (unsupported.length) {
        throw new Error(`${dbName}: cannot restore a baseline for a schema containing ${unsupported.join(', ')}`)
    }
}

// One transaction, so the suite never sees a half-restored database. Sequence positions are part of the
// baseline: truncating leaves them where the last test took them.
const restoreBaseline = async (administrator, {tables, sequences}) => {
    await administrator.query('BEGIN')
    try {
        await administrator.query(`TRUNCATE TABLE ${tables.map(({table}) => table).join(', ')}`)
        for (const {table, rows} of tables) {
            await administrator.query(
                `INSERT INTO ${table} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_recordset(NULL::${table}, $1)`,
                [rows]
            )
        }
        for (const {sequence, value, called} of sequences) {
            await administrator.query('SELECT setval($1::regclass, $2::bigint, $3)', [sequence, value, called])
        }
        await administrator.query('COMMIT')
    } catch (error) {
        await administrator.query('ROLLBACK').catch(() => {})
        throw error
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
