process.env.MYSQL_HOST = 'host'
process.env.MYSQL_USER = 'user'
process.env.MYSQL_PASSWORD = 'password'

const {createTransactionRunner} = await import('./mysql.js')

test('begins, runs the callback on the connection, commits, releases, and returns its result', async () => {
    const pool = fakePool()
    const transaction = createTransactionRunner(pool)

    let seen
    const result = await transaction(async connection => {
        seen = connection
        pool.calls.push('callback')
        return 'result'
    })

    expect(pool.calls).toEqual(['getConnection', 'begin', 'callback', 'commit', 'release'])
    expect(seen).toBe(pool.connection)
    expect(result).toBe('result')
})

test('rolls back and releases when the callback fails, and reports the failure', async () => {
    const pool = fakePool()
    const transaction = createTransactionRunner(pool)

    const failed = transaction(failing(new Error('callback failed')))

    await expect(failed).rejects.toThrow('callback failed')
    expect(pool.calls).toEqual(['getConnection', 'begin', 'rollback', 'release'])
})

test('rolls back and releases when the commit fails', async () => {
    const pool = fakePool({commit: failing(new Error('commit failed'))})
    const transaction = createTransactionRunner(pool)

    const failed = transaction(async () => 'unused')

    await expect(failed).rejects.toThrow('commit failed')
    expect(pool.calls).toEqual(['getConnection', 'begin', 'commit', 'rollback', 'release'])
})

test('a failed rollback never replaces the original failure', async () => {
    const rollbackError = new Error('rollback failed')
    const pool = fakePool({rollback: failing(rollbackError)})
    const transaction = createTransactionRunner(pool)

    const failed = transaction(failing(new Error('callback failed')))

    await expect(failed).rejects.toMatchObject({message: 'callback failed', rollbackError})
    expect(pool.calls).toEqual(['getConnection', 'begin', 'rollback', 'release'])

    // An error that cannot carry the rollback failure must still be the one that propagates.
    const frozen = Object.freeze(new Error('frozen'))
    const failedWithFrozen = transaction(failing(frozen))
    const failedWithPrimitive = transaction(failing('a string'))

    await expect(failedWithFrozen).rejects.toBe(frozen)
    await expect(failedWithPrimitive).rejects.toBe('a string')
})

const failing = error => () => Promise.reject(error)

const fakePool = (over = {}) => {
    const calls = []
    const step = (name, behaviour) => async () => {
        calls.push(name)
        return behaviour ? await behaviour() : undefined
    }
    const connection = {
        beginTransaction: step('begin', over.beginTransaction),
        commit: step('commit', over.commit),
        rollback: step('rollback', over.rollback),
        release: step('release', over.release)
    }
    return {
        calls,
        connection,
        getConnection: async () => {
            calls.push('getConnection')
            return connection
        }
    }
}
