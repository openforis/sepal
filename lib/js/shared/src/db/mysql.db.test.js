import {createDb} from './mysql.js'

describe('withTransaction', () => {
    test('a failed commit is rolled back and reported, and the connection goes back to the pool', async () => {
        const pool = aPool({commit: failing(new Error('commit failed'))})
        const db = createDb(pool)

        const transaction = db.withTransaction(async () => 'unused')

        await expect(transaction).rejects.toThrow('commit failed')
        expect(pool.connection).toMatchObject({transaction: 'rolled back', disposal: 'released'})
    })

    test('a failed rollback travels with the original failure, and the connection is discarded', async () => {
        const rollbackError = new Error('rollback failed')
        const pool = aPool({rollback: failing(rollbackError)})
        const db = createDb(pool)

        const transaction = db.withTransaction(failing(new Error('callback failed')))

        await expect(transaction).rejects.toMatchObject({message: 'callback failed', rollbackError})
        expect(pool.connection.disposal).toBe('destroyed')
    })

    test.each([[Object.freeze(new Error('frozen'))], ['a string']])(
        'a failure that cannot carry the rollback failure still propagates as itself: %p',
        async failure => {
            const pool = aPool({rollback: failing(new Error('rollback failed'))})
            const db = createDb(pool)

            const transaction = db.withTransaction(failing(failure))

            await expect(transaction).rejects.toBe(failure)
        }
    )

    test('a connection that cannot be released after a failure is discarded, and the failure still propagates', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const transaction = db.withTransaction(failing(new Error('callback failed')))

        await expect(transaction).rejects.toThrow('callback failed')
        expect(pool.connection.disposal).toBe('destroyed')
    })

    test('a connection that cannot be released after a commit is discarded, and the result still returns', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const result = await db.withTransaction(async () => 'the result')

        expect(result).toBe('the result')
        expect(pool.connection).toMatchObject({transaction: 'committed', disposal: 'destroyed'})
    })
})

describe('withConnection', () => {
    test('returns the connection to the pool even when the callback fails', async () => {
        const pool = aPool()
        const db = createDb(pool)

        const operation = db.withConnection(failing(new Error('callback failed')))

        await expect(operation).rejects.toThrow('callback failed')
        expect(pool.connection.disposal).toBe('released')
    })

    test('a connection that cannot be released is discarded, and the failure still propagates', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const operation = db.withConnection(failing(new Error('callback failed')))

        await expect(operation).rejects.toThrow('callback failed')
        expect(pool.connection.disposal).toBe('destroyed')
    })
})

const failing = error => () => Promise.reject(error)

const throwing = error => () => {
    throw error
}

// The pool-connection port as the wrapper drives it: the transaction verbs, and the two ways of giving
// a connection back. `transaction` and `disposal` record where the wrapper left it.
const aPool = (behaviour = {}) => {
    const connection = {
        transaction: 'none',
        disposal: null,
        async beginTransaction() {
            await (behaviour.beginTransaction ?? resolved)()
            this.transaction = 'open'
        },
        async commit() {
            await (behaviour.commit ?? resolved)()
            this.transaction = 'committed'
        },
        async rollback() {
            await (behaviour.rollback ?? resolved)()
            this.transaction = 'rolled back'
        },
        release() {
            (behaviour.release ?? nothing)()
            this.disposal = 'released'
        },
        destroy() {
            this.disposal = 'destroyed'
        }
    }
    return {connection, getConnection: async () => connection}
}

const resolved = async () => {}

const nothing = () => {}
