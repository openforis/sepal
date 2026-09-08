import {randomBytes} from 'crypto'

import {createConnection, createDb, createPool} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'

describe('a db wrapping a pool', () => {
    let admin
    let scratch
    let pool
    let db
    const reserved = []

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    // One connection and no queue: an operation that failed to give its connection back makes the
    // next one fail outright, instead of quietly being served by another connection.
    beforeEach(async () => {
        scratch = await reserveDatabase()
        await admin.query('CREATE TABLE ??.item (id VARCHAR(36) PRIMARY KEY)', [scratch])
        pool = await createPool(scratch, {connectionLimit: 1, waitForConnections: false})
        db = createDb(pool)
    })

    afterEach(async () => {
        await pool?.end()
        await dropReservedDatabases()
    })

    afterAll(() => admin?.end())

    test('commits what the callback wrote, so another connection can read it', async () => {
        await db.withTransaction(connection => insertItem(connection, 'committed'))

        const items = await itemsSeenByAnotherConnection()
        expect(items).toEqual(['committed'])
    })

    test('resolves to the result of the callback', async () => {
        const result = await db.withTransaction(async () => 'the result')

        expect(result).toBe('the result')
    })

    test('rolls back everything the callback wrote before it failed', async () => {
        const transaction = db.withTransaction(async connection => {
            await insertItem(connection, 'written before the failure')
            throw new Error('callback failed')
        })

        await expect(transaction).rejects.toThrow('callback failed')
        const items = await itemsSeenByAnotherConnection()
        expect(items).toEqual([])
    })

    test('gives its only connection back after a failed transaction, so the next one is served', async () => {
        await givenAFailedTransaction()

        await db.withTransaction(connection => insertItem(connection, 'after the failure'))

        const items = await itemsSeenByAnotherConnection()
        expect(items).toEqual(['after the failure'])
    })

    test('withConnection leaves a write in place when the callback fails afterwards', async () => {
        const operation = db.withConnection(async connection => {
            await insertItem(connection, 'kept')
            throw new Error('callback failed')
        })

        await expect(operation).rejects.toThrow('callback failed')
        const items = await itemsSeenByAnotherConnection()
        expect(items).toEqual(['kept'])
    })

    test('gives its only connection back after a failed withConnection, so the next one is served', async () => {
        await givenAFailedOperation()

        await db.withConnection(connection => insertItem(connection, 'after the failure'))

        const items = await itemsSeenByAnotherConnection()
        expect(items).toEqual(['after the failure'])
    })

    const givenAFailedTransaction = () =>
        db.withTransaction(() => Promise.reject(new Error('earlier failure'))).catch(() => {})

    const givenAFailedOperation = () =>
        db.withConnection(() => Promise.reject(new Error('earlier failure'))).catch(() => {})

    const insertItem = (connection, id) => connection.query('INSERT INTO item (id) VALUES (?)', [id])

    const itemsSeenByAnotherConnection = async () => {
        const [rows] = await admin.query('SELECT id FROM ??.item ORDER BY id', [scratch])
        return rows.map(({id}) => id)
    }

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const name = `db_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${name}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(name)
        return name
    }

    const dropReservedDatabases = async () => {
        for (const name of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${name}\``)
        }
    }
})
