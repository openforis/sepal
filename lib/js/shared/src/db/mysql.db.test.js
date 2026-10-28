import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {createDb} from './mysql.js'

describe('withTransaction', () => {
    test('a failed commit is rolled back and reported, and the connection goes back to the pool', async () => {
        const pool = aPool({commit: failing(new Error('commit failed'))})
        const db = createDb(pool)

        const transaction = db.withTransaction(async () => 'unused')

        await assert.rejects(transaction, /commit failed/)
        assert.partialDeepStrictEqual(pool.connection, {transaction: 'rolled back', disposal: 'released'})
    })

    test('a failed rollback travels with the original failure, and the connection is discarded', async () => {
        const rollbackError = new Error('rollback failed')
        const pool = aPool({rollback: failing(rollbackError)})
        const db = createDb(pool)

        const transaction = db.withTransaction(failing(new Error('callback failed')))

        await assert.rejects(transaction, {message: 'callback failed', rollbackError})
        assert.equal(pool.connection.disposal, 'destroyed')
    })

    for (const [failure] of [[Object.freeze(new Error('frozen'))], ['a string']]) {
        test(
            `a failure that cannot carry the rollback failure still propagates as itself: ${failure}`,
            async () => {
                const pool = aPool({rollback: failing(new Error('rollback failed'))})
                const db = createDb(pool)

                const transaction = db.withTransaction(failing(failure))

                await assert.rejects(transaction, error => error === failure)
            }
        )
    }

    test('a connection that cannot be released after a failure is discarded, and the failure still propagates', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const transaction = db.withTransaction(failing(new Error('callback failed')))

        await assert.rejects(transaction, /callback failed/)
        assert.equal(pool.connection.disposal, 'destroyed')
    })

    test('a connection that cannot be released after a commit is discarded, and the result still returns', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const result = await db.withTransaction(async () => 'the result')

        assert.equal(result, 'the result')
        assert.partialDeepStrictEqual(pool.connection, {transaction: 'committed', disposal: 'destroyed'})
    })
})

describe('withConnection', () => {
    test('returns the connection to the pool even when the callback fails', async () => {
        const pool = aPool()
        const db = createDb(pool)

        const operation = db.withConnection(failing(new Error('callback failed')))

        await assert.rejects(operation, /callback failed/)
        assert.equal(pool.connection.disposal, 'released')
    })

    test('a connection that cannot be released is discarded, and the failure still propagates', async () => {
        const pool = aPool({release: throwing(new Error('release failed'))})
        const db = createDb(pool)

        const operation = db.withConnection(failing(new Error('callback failed')))

        await assert.rejects(operation, /callback failed/)
        assert.equal(pool.connection.disposal, 'destroyed')
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
