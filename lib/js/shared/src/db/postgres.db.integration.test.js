import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {createConnection, createDb, createPool, isUniqueViolation} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'

describe('a db wrapping a pool', () => {
    let admin
    let scratch
    let pool
    let db
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres')
    })

    // One client: an operation that failed to give its client back leaves none for the next one.
    beforeEach(async () => {
        scratch = await reserveDatabase()
        await withAnotherConnection(client => client.query('CREATE TABLE item (id text PRIMARY KEY)'))
        pool = await createPool(scratch, {max: 1, connectionTimeoutMillis: 5000})
        db = createDb(pool)
    })

    afterEach(async () => {
        await pool?.end()
        await dropReservedDatabases()
    })

    after(() => admin?.end())

    describe('withTransaction', () => {
        test('commits what the callback did, so another connection can read it', async () => {
            await db.withTransaction(client => insertItem(client, 'committed'))

            const items = await itemsSeenByAnotherConnection()
            assert.deepEqual(items, ['committed'])
        })

        test('resolves to the result of the callback', async () => {
            const result = await db.withTransaction(async () => 'the result')

            assert.equal(result, 'the result')
        })

        test('rolls back everything when the callback throws', async () => {
            const transaction = db.withTransaction(async client => {
                await insertItem(client, 'written before the failure')
                throw new Error('callback failed')
            })

            await assert.rejects(transaction, /callback failed/)
            const items = await itemsSeenByAnotherConnection()
            assert.deepEqual(items, [])
        })

        test('fails when a statement the callback swallowed aborted the transaction, and keeps none of it', async () => {
            const transaction = db.withTransaction(async client => {
                await insertItem(client, 'written before the failure')
                await client.query('SELECT 1 / 0').catch(() => {})
            })

            await assert.rejects(transaction, /rolled back/)
            const items = await itemsSeenByAnotherConnection()
            assert.deepEqual(items, [])
        })

        test('attaches a failed rollback to the original error as rollbackError and discards the client', async () => {
            const rollbackError = new Error('rollback failed')

            const transaction = db.withTransaction(async client => {
                failRollback(client, rollbackError)
                throw new Error('callback failed')
            })

            await assert.rejects(transaction, {message: 'callback failed', rollbackError})
            assert.equal(pool.totalCount, 0)
        })

        test('gives its client back after a failed transaction, so the next one is served', async () => {
            await givenAFailedTransaction()

            await db.withTransaction(client => insertItem(client, 'after the failure'))

            const items = await itemsSeenByAnotherConnection()
            assert.deepEqual(items, ['after the failure'])
        })
    })

    describe('withConnection', () => {
        test('leaves a write in place when the callback fails afterwards', async () => {
            const operation = db.withConnection(async client => {
                await insertItem(client, 'kept')
                throw new Error('callback failed')
            })

            await assert.rejects(operation, /callback failed/)
            const items = await itemsSeenByAnotherConnection()
            assert.deepEqual(items, ['kept'])
        })

        test('releases the client when the callback throws', async () => {
            await givenAnIdleClient()
            const idleBefore = pool.idleCount

            await assert.rejects(db.withConnection(failing(new Error('callback failed'))), /callback failed/)

            assert.equal(pool.idleCount, idleBefore)
        })

        test('survives the server terminating the connection the callback holds', async () => {
            const operation = db.withConnection(async client => {
                await terminateBackendOf(client)
                return client.query('SELECT 1')
            })

            await assert.rejects(operation, /not queryable/)
            await db.withConnection(client => insertItem(client, 'after the termination'))
            assert.deepEqual(await itemsSeenByAnotherConnection(), ['after the termination'])
        })
    })

    describe('the pool', () => {
        test('survives the server terminating an idle connection', async () => {
            const pid = await db.withConnection(backendPid)

            const removed = nextEvent(pool, 'remove')
            await admin.query('SELECT pg_terminate_backend($1)', [pid])
            await removed

            await db.withConnection(client => insertItem(client, 'after the termination'))
            assert.deepEqual(await itemsSeenByAnotherConnection(), ['after the termination'])
        })
    })

    describe('type parsing', () => {
        test('parses COUNT(*) as a number', async () => {
            const {rows} = await db.withConnection(client =>
                client.query('SELECT count(*) AS n FROM generate_series(1, 3)')
            )

            assert.deepEqual(rows, [{n: 3}])
        })

        test('refuses an int8 beyond the safe integer range', async () => {
            const query = db.withConnection(client => client.query('SELECT 9007199254740993::int8 AS n'))

            await assert.rejects(query, RangeError)
        })

        test('leaves numeric as a string, so no precision is lost', async () => {
            const {rows} = await db.withConnection(client => client.query('SELECT 0.1::numeric AS n'))

            assert.deepEqual(rows, [{n: '0.1'}])
        })

        test('returns timestamptz as Date', async () => {
            const instant = new Date('2026-11-20T12:34:56.789Z')

            const {rows} = await db.withConnection(client =>
                client.query('SELECT $1::timestamptz AS at', [instant])
            )

            assert.deepEqual(rows, [{at: instant}])
        })
    })

    describe('isUniqueViolation', () => {
        test('recognises SQLSTATE 23505', async () => {
            await db.withConnection(client => insertItem(client, 'duplicated'))

            const error = await db.withConnection(client => insertItem(client, 'duplicated')).catch(error => error)

            assert.equal(isUniqueViolation(error), true)
        })

        test('rejects any other failure', async () => {
            const error = await db.withConnection(client => client.query('SELECT * FROM missing')).catch(error => error)

            assert.equal(isUniqueViolation(error), false)
        })
    })

    const givenAFailedTransaction = () =>
        db.withTransaction(failing(new Error('earlier failure'))).catch(() => {})

    const givenAnIdleClient = () =>
        db.withConnection(async () => {})

    const failing = error => async () => {
        throw error
    }

    const failRollback = (client, error) => {
        const query = client.query.bind(client)
        client.query = (sql, ...args) => sql === 'ROLLBACK' ? Promise.reject(error) : query(sql, ...args)
    }

    const insertItem = (client, id) => client.query('INSERT INTO item (id) VALUES ($1)', [id])

    const backendPid = async client => {
        const {rows: [{pid}]} = await client.query('SELECT pg_backend_pid() AS pid')
        return pid
    }

    const terminateBackendOf = async client => {
        const ended = nextEvent(client, 'end')
        await admin.query('SELECT pg_terminate_backend($1)', [await backendPid(client)])
        await ended
    }

    // Unlike events.once, does not listen for 'error', which would hide that nobody else does.
    const nextEvent = (emitter, name) =>
        new Promise(resolve => emitter.once(name, resolve))

    const itemsSeenByAnotherConnection = () =>
        withAnotherConnection(async client => {
            const {rows} = await client.query('SELECT id FROM item ORDER BY id')
            return rows.map(({id}) => id)
        })

    const withAnotherConnection = async callback => {
        const client = await createConnection(scratch)
        try {
            return await callback(client)
        } finally {
            await client.end()
        }
    }

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const name = `db_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE ${name}`)
        reserved.push(name)
        return name
    }

    const dropReservedDatabases = async () => {
        for (const name of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
        }
    }
})
