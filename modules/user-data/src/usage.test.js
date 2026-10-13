import {Usage} from './usage.js'

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

        expect(harness.published).toHaveLength(1)
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

function usageHarness({dirty = [], owners = [], known = [], sizes = {}, failing = [], slow = false}) {
    let time = Date.parse('2026-10-13T10:00:00Z')
    const harness = {published: [], recorded: [], dirty: [...dirty]}
    const repository = {
        markDirty: async username => {
            if (!harness.dirty.includes(username)) {
                harness.dirty.push(username)
            }
        },
        dirtyUsernames: async () => [...harness.dirty],
        knownUsernames: async () => [...known],
        recordMeasurement: async (username, size) => {
            harness.recorded.push([username, size])
            harness.dirty = harness.dirty.filter(user => user !== username)
        }
    }
    const provider = {
        owners: async () => [...owners],
        measureUsage: async ({owner}) => {
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
        events: {emitUserDataSize: (username, size) => harness.published.push({username, size})},
        now: () => new Date(time)
    })
    harness.advance = ms => {
        time += ms
    }
    return harness
}
