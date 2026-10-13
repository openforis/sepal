import {configureNoLogging} from '#sepal/log'

import {Attachments} from './attachments.js'
import {Lifecycle} from './lifecycle.js'

beforeAll(() => configureNoLogging())

describe('onUserStorageErased', () => {
    it('records the request, erases, records the Data as empty and due for measuring, then clears the request', async () => {
        const harness = lifecycleHarness({known: ['alice']})

        await harness.lifecycle.onUserStorageErased({username: 'alice'})

        expect(harness.calls).toEqual([
            ['requestErase', 'alice'],
            ['erase', 'alice'],
            ['recordErased', 'alice'],
            ['markDirty', 'alice'],
            ['clearEraseRequest', 'alice']
        ])
    })

    it('erases only the Data stored before the request', async () => {
        const harness = lifecycleHarness({known: ['alice']})

        await harness.lifecycle.onUserStorageErased({username: 'alice'})

        expect(harness.erasedBefore).toEqual({alice: new Date('2026-10-13T10:00:01Z')})
    })

    it('leaves alone a user unknown here who has no Data', async () => {
        const harness = lifecycleHarness({sizes: {carol: 0}})

        await harness.lifecycle.onUserStorageErased({username: 'carol'})

        expect(harness.calls).toEqual([])
    })

    it('erases a user unknown here who has Data', async () => {
        const harness = lifecycleHarness({sizes: {carol: 5}})

        await harness.lifecycle.onUserStorageErased({username: 'carol'})

        expect(harness.calls).toContainEqual(['erase', 'carol'])
    })

    it('erases a user unknown here whose Data cannot be measured', async () => {
        const harness = lifecycleHarness({unmeasurable: ['carol']})

        await harness.lifecycle.onUserStorageErased({username: 'carol'})

        expect(harness.calls).toContainEqual(['erase', 'carol'])
    })

    it('keeps the request pending when erasing fails, without rejecting', async () => {
        const harness = lifecycleHarness({known: ['alice'], failing: ['alice']})

        await harness.lifecycle.onUserStorageErased({username: 'alice'})

        expect(harness.pending).toEqual(['alice'])
        expect(harness.calls.map(([call]) => call)).not.toContain('recordErased')
    })

    it('rejects when the request cannot be recorded, so the queue retries', async () => {
        const harness = lifecycleHarness({known: ['alice'], requestFails: true})

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

    it('erases only the Data stored before the pending request', async () => {
        const harness = lifecycleHarness({pending: ['bob']})

        await harness.lifecycle.retryPending()

        expect(harness.erasedBefore).toEqual({bob: new Date('2026-10-13T10:00:01Z')})
    })

    it('does not run twice at once', async () => {
        const harness = lifecycleHarness({pending: ['alice'], slow: true})

        await Promise.all([harness.lifecycle.retryPending(), harness.lifecycle.retryPending()])

        expect(harness.calls.filter(([call]) => call === 'erase')).toHaveLength(1)
    })
})

function lifecycleHarness({known = [], pending = [], sizes = {}, unmeasurable = [], failing = [], requestFails = false, slow = false} = {}) {
    let time = Date.parse('2026-10-13T10:00:00Z')
    const harness = {calls: [], pending: [], requestedAt: {}, erasedBefore: {}}
    const request = username => {
        if (!harness.pending.includes(username)) {
            harness.pending.push(username)
            harness.requestedAt[username] = new Date(time += 1000)
        }
    }
    pending.forEach(request)
    const repository = {
        isKnown: async username => known.includes(username) || pending.includes(username),
        requestErase: async username => {
            if (requestFails) {
                throw new Error('db down')
            }
            harness.calls.push(['requestErase', username])
            request(username)
            return harness.requestedAt[username]
        },
        eraseRequests: async () => {
            if (slow) {
                await new Promise(resolve => setImmediate(resolve))
            }
            return harness.pending.map(username => ({username, requestedAt: harness.requestedAt[username]}))
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
                measureUsage: async ({owner}) => {
                    if (unmeasurable.includes(owner)) {
                        throw new Error('s3 down')
                    }
                    return sizes[owner] ?? 0
                },
                erase: async ({owner}, {before}) => {
                    harness.calls.push(['erase', owner])
                    harness.erasedBefore[owner] = before
                    if (failing.includes(owner)) {
                        throw new Error('s3 down')
                    }
                }
            })
        },
        usage: {
            recordErased: async username => harness.calls.push(['recordErased', username]),
            markDirty: async username => harness.calls.push(['markDirty', username])
        },
        repository
    })
    return harness
}
