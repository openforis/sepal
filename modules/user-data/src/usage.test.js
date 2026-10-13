import {configureNoLogging} from '#sepal/log'

import {Usage} from './usage.js'

beforeAll(() => configureNoLogging())

describe('tick', () => {
    it('measures the dirty users and publishes their size', async () => {
        const harness = usageHarness({dirty: ['alice'], sizes: {alice: 1500}})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 1500}])
        expect(harness.recorded).toEqual([['alice', 1500]])
    })

    it('marks every user with Data dirty once a day', async () => {
        const harness = usageHarness({owners: ['alice', 'bob'], sizes: {alice: 1, bob: 2}})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 1}, {username: 'bob', size: 2}])
    })

    it('does not sweep all users again within the day', async () => {
        const harness = usageHarness({owners: ['alice'], sizes: {alice: 1}})
        await harness.usage.tick()
        harness.advance(23 * HOUR)

        await harness.usage.tick()

        expect(harness.recorded).toHaveLength(1)
    })

    it('sweeps all users again after a day', async () => {
        const harness = usageHarness({owners: ['alice'], sizes: {alice: 1}})
        await harness.usage.tick()
        harness.advance(24 * HOUR)

        await harness.usage.tick()

        expect(harness.recorded).toEqual([['alice', 1], ['alice', 1]])
    })

    it('measures the dirty users and republishes known sizes when finding the users with Data fails', async () => {
        const harness = usageHarness({dirty: ['alice'], sizes: {alice: 15}, measured: {bob: 20}, failingOwners: 1})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 15}, {username: 'bob', size: 20}])
    })

    it('retries the sweep on the next tick after it failed', async () => {
        const harness = usageHarness({owners: ['carol'], sizes: {carol: 3}, failingOwners: 1})
        await harness.usage.tick()

        await harness.usage.tick()

        expect(harness.recorded).toEqual([['carol', 3]])
    })

    it('records when a measurement started', async () => {
        const harness = usageHarness({dirty: ['alice'], sizes: {alice: 1}, measuringTakes: HOUR})

        await harness.usage.tick()

        expect(harness.measuredFrom).toEqual({alice: new Date('2026-10-13T10:00:00Z')})
    })

    it('keeps the recorded measurement when publishing it fails', async () => {
        const harness = usageHarness({dirty: ['alice'], sizes: {alice: 15}, failingPublish: ['alice']})

        await harness.usage.tick()

        expect(harness.recorded).toEqual([['alice', 15]])
        expect(harness.dirty).toEqual([])
    })

    it('also re-measures users it measured before but who no longer have Data', async () => {
        const harness = usageHarness({known: ['gone'], sizes: {gone: 0}})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'gone', size: 0}])
    })

    it('keeps a user dirty when measuring fails, and measures the others', async () => {
        const harness = usageHarness({dirty: ['alice', 'bob'], sizes: {bob: 2}, failing: ['alice']})

        await harness.usage.tick()

        expect(harness.recorded).toEqual([['bob', 2]])
        expect(harness.dirty).toContain('alice')
    })

    it('republishes the recorded size of every known user each tick', async () => {
        const harness = usageHarness({measured: {alice: 10, bob: 20}})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 10}, {username: 'bob', size: 20}])
    })

    it('publishes a user measured in this tick once', async () => {
        const harness = usageHarness({dirty: ['alice'], measured: {alice: 10, bob: 20}, sizes: {alice: 15}})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 15}, {username: 'bob', size: 20}])
    })

    it('republishes the others when republishing one user fails', async () => {
        const harness = usageHarness({measured: {alice: 10, bob: 20}, failingPublish: ['alice']})

        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'bob', size: 20}])
    })

    it('does not run two ticks at once', async () => {
        const harness = usageHarness({dirty: ['alice'], sizes: {alice: 1}, slow: true})

        await Promise.all([harness.usage.tick(), harness.usage.tick()])

        expect(harness.published).toHaveLength(1)
    })
})

describe('markDirty', () => {
    it('marks the user for the next tick', async () => {
        const harness = usageHarness({sizes: {alice: 5}})
        await harness.usage.tick() // the first tick sweeps; there are no owners yet

        await harness.usage.markDirty('alice')
        await harness.usage.tick()

        expect(harness.published).toEqual([{username: 'alice', size: 5}])
    })
})

describe('recordErased', () => {
    it('records an erased user as empty and publishes it', async () => {
        const harness = usageHarness({})

        await harness.usage.recordErased('alice')

        expect(harness.recorded).toEqual([['alice', 0]])
        expect(harness.published).toEqual([{username: 'alice', size: 0}])
    })
})

const HOUR = 60 * 60 * 1000

function usageHarness({dirty = [], owners = [], known = [], sizes = {}, measured = {}, failing = [], failingPublish = [], failingOwners = 0, measuringTakes = 0, slow = false}) {
    let time = Date.parse('2026-10-13T10:00:00Z')
    let remainingOwnersFailures = failingOwners
    const harness = {published: [], recorded: [], measuredFrom: {}, dirty: [...dirty], measured: {...measured}}
    const repository = {
        markDirty: async username => {
            if (!harness.dirty.includes(username)) {
                harness.dirty.push(username)
            }
        },
        dirtyUsernames: async () => [...harness.dirty],
        knownUsernames: async () => [...known],
        measurements: async () => Object.entries(harness.measured)
            .map(([username, size]) => ({username, size}))
            .sort((a, b) => a.username.localeCompare(b.username)),
        recordMeasurement: async (username, size, measuredFrom) => {
            harness.recorded.push([username, size])
            harness.measuredFrom[username] = measuredFrom
            harness.measured[username] = size
            harness.dirty = harness.dirty.filter(user => user !== username)
        }
    }
    const provider = {
        owners: async () => {
            if (remainingOwnersFailures > 0) {
                remainingOwnersFailures--
                throw new Error('cannot list owners')
            }
            return [...owners]
        },
        measureUsage: async ({owner}) => {
            time += measuringTakes
            if (slow) {
                await new Promise(resolve => setImmediate(resolve))
            }
            if (failing.includes(owner)) {
                throw new Error(`cannot list ${owner}`)
            }
            return sizes[owner] ?? 0
        }
    }
    harness.usage = new Usage({
        repository,
        attachments: {get: (owner, id) => ({id, owner, provider: 's3'}), dataProvider: () => 's3'},
        providers: {for: () => provider},
        events: {
            emitUserDataSize: (username, size) => {
                if (failingPublish.includes(username)) {
                    throw new Error(`cannot publish ${username}`)
                }
                harness.published.push({username, size})
            }
        },
        now: () => new Date(time)
    })
    harness.advance = ms => {
        time += ms
    }
    return harness
}
