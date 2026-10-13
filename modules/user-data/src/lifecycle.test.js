import {Attachments} from './attachments.js'
import {Lifecycle} from './lifecycle.js'

describe('onUserStorageErased', () => {
    it('records the request, erases, records the Data as empty, then clears the request', async () => {
        const harness = lifecycleHarness()

        await harness.lifecycle.onUserStorageErased({username: 'alice'})

        expect(harness.calls).toEqual([
            ['requestErase', 'alice'],
            ['erase', 'alice'],
            ['recordErased', 'alice'],
            ['clearEraseRequest', 'alice']
        ])
    })

    it('keeps the request pending when erasing fails, without rejecting', async () => {
        const harness = lifecycleHarness({failing: ['alice']})

        await harness.lifecycle.onUserStorageErased({username: 'alice'})

        expect(harness.pending).toEqual(['alice'])
        expect(harness.calls.map(([call]) => call)).not.toContain('recordErased')
    })

    it('rejects when the request cannot be recorded, so the queue retries', async () => {
        const harness = lifecycleHarness({requestFails: true})

        await expect(harness.lifecycle.onUserStorageErased({username: 'alice'})).rejects.toThrow('db down')
    })
})

describe('retryPending', () => {
    it('erases pending users and keeps the failed one pending', async () => {
        const harness = lifecycleHarness({pending: ['alice', 'bob'], failing: ['alice']})

        await harness.lifecycle.retryPending()

        expect(harness.pending).toEqual(['alice'])
        expect(harness.calls).toContainEqual(['recordErased', 'bob'])
    })

    it('does not run twice at once', async () => {
        const harness = lifecycleHarness({pending: ['alice'], slow: true})

        await Promise.all([harness.lifecycle.retryPending(), harness.lifecycle.retryPending()])

        expect(harness.calls.filter(([call]) => call === 'erase')).toHaveLength(1)
    })
})

function lifecycleHarness({pending = [], failing = [], requestFails = false, slow = false} = {}) {
    const harness = {calls: [], pending: [...pending]}
    const repository = {
        requestErase: async username => {
            if (requestFails) {
                throw new Error('db down')
            }
            harness.calls.push(['requestErase', username])
            if (!harness.pending.includes(username)) {
                harness.pending.push(username)
            }
        },
        eraseRequests: async () => {
            if (slow) {
                await new Promise(resolve => setImmediate(resolve))
            }
            return [...harness.pending]
        },
        clearEraseRequest: async username => {
            harness.calls.push(['clearEraseRequest', username])
            harness.pending = harness.pending.filter(user => user !== username)
        }
    }
    harness.lifecycle = new Lifecycle({
        attachments: new Attachments({bucket: 'b'}),
        providers: {
            for: () => ({
                erase: async ({owner}) => {
                    harness.calls.push(['erase', owner])
                    if (failing.includes(owner)) {
                        throw new Error('s3 down')
                    }
                }
            })
        },
        usage: {recordErased: async username => harness.calls.push(['recordErased', username])},
        repository
    })
    return harness
}
