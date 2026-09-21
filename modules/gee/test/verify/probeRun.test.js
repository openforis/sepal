import {cleanupScratch, createDeletionGuard, isTerminal, runMode} from '../../verify/probeRun.mjs'

// A probe's cleanup and its reruns are fresh processes: whatever the run that started the exports knew about
// their destinations is gone. Earth Engine's operation listing is the only thing left that can say whether a
// task is still writing to one.

const RUN = 'run1'
const PARENT = 'projects/p/assets/probe'

describe('what a probe run may delete', () => {
    it('allows deletion once every task of this run has reached a terminal state', async () => {
        const guard = guardOver([[task({name: 'image', state: 'COMPLETED'}), task({name: 'tile', state: 'FAILED'})]])

        expect(await guard()).toEqual({allowed: true, tasks: []})
    })

    it('blocks deletion while a task of this run has not', async () => {
        const guard = guardOver([[task({name: 'image', state: 'RUNNING'})]])

        const decision = await guard()

        expect(decision.allowed).toBe(false)
        expect(decision.tasks).toEqual([expect.objectContaining({state: 'RUNNING', description: 'run1_image'})])
    })

    it('blocks deletion on a task state it does not recognise', async () => {
        const unrecognised = await guardOver([[task({name: 'image', state: 'PENDING_SOMETHING'})]])()
        const absent = await guardOver([[task({name: 'image', state: undefined})]])()

        expect(unrecognised.allowed).toBe(false)
        expect(absent.allowed).toBe(false)
    })

    it('blocks deletion when the task states cannot be established', async () => {
        const guard = createDeletionGuard({runId: RUN, data: earthEngine({error: new Error('socket hang up')})})

        const decision = await guard()

        expect(decision.allowed).toBe(false)
        expect(decision.failure).toEqual({status: 'TRANSPORT', error: 'socket hang up'})
    })

    // A limit given to listOperations truncates the result and stops the SDK following nextPageToken, so a probe
    // that passes one is blind to everything after it - including its own task still writing.
    it('sees a task of this run beyond the first page of operations', async () => {
        const guard = guardOver([
            Array.from({length: 100}, (_value, index) => task({name: `done${index}`, state: 'COMPLETED'})),
            [task({name: 'image', state: 'RUNNING'})]
        ])

        expect((await guard()).allowed).toBe(false)
    })

    it('unwraps the shape the Earth Engine client returns operations in', async () => {
        const guard = guardOver([[serializable(task({name: 'image', state: 'RUNNING'}))]])

        expect((await guard()).allowed).toBe(false)
    })

    it('is not blocked by another run\'s unfinished task, but reports it', async () => {
        const guard = guardOver([[
            task({name: 'image', state: 'COMPLETED'}),
            task({run: 'run10', name: 'image', state: 'RUNNING'})
        ]])

        expect(await guard()).toEqual({
            allowed: true,
            tasks: [expect.objectContaining({description: 'run10_image'})]
        })
    })

    it('recognises only explicitly terminal states as finished', () => {
        expect(isTerminal('COMPLETED')).toBe(true)
        expect(isTerminal('CANCELLED')).toBe(true)
        expect(isTerminal('CANCEL_REQUESTED')).toBe(false)
        expect(isTerminal(undefined)).toBe(false)
    })
})

describe('removing what a probe run created', () => {
    it('deletes this run\'s assets and its collections\' tiles, and leaves every other run\'s alone', async () => {
        const assets = scratchAssets()

        const result = await cleanup({assets})

        expect(result.status).toBe('DONE')
        expect(result.deleted.sort()).toEqual([
            `${PARENT}/run1_collection`, `${PARENT}/run1_collection/0`, `${PARENT}/run1_image`
        ])
        expect(result.skipped).toEqual([`${PARENT}/run2_image`])
        expect(assets.ids()).toEqual([`${PARENT}/run2_image`])
        expect(result.remainingListed).toBe(0)
    })

    it('deletes nothing while a task of this run is unfinished', async () => {
        const assets = scratchAssets()

        const result = await cleanup({assets, guard: async () => ({
            allowed: false, reason: 'still writing', tasks: [{description: 'run1_image', state: 'RUNNING'}]
        })})

        expect(result.status).toBe('SKIPPED')
        expect(result.reason).toBe('still writing')
        expect(assets.ids()).toHaveLength(4)
        expect(result.remainingListed).toBe('UNKNOWN')
    })

    it('deletes nothing when the task states cannot be established', async () => {
        const assets = scratchAssets()
        const data = earthEngine({error: new Error('socket hang up')})

        const result = await cleanup({assets, guard: createDeletionGuard({runId: RUN, data})})

        expect(result.status).toBe('SKIPPED')
        expect(assets.ids()).toHaveLength(4)
    })

    it('reports what it could not delete rather than reporting nothing left', async () => {
        const assets = scratchAssets()
        assets.refuse(`delete:${PARENT}/run1_image`, {status: 'PERMISSION_DENIED', error: 'Permission denied'})

        const result = await cleanup({assets})

        expect(result.status).toBe('INCOMPLETE')
        expect(result.failures).toEqual([
            {assetId: `${PARENT}/run1_image`, status: 'PERMISSION_DENIED', error: 'Permission denied'}
        ])
        expect(result.remainingListed).toBe(1)
    })

    // Earth Engine answers a delete it will not perform the same way it answers one for an asset that is not
    // there. Neither removed anything, and the count that follows is of what the listing showed, not of what
    // was removed.
    it('does not count a delete Earth Engine refused as a deletion', async () => {
        const assets = scratchAssets()
        assets.refuse(`delete:${PARENT}/run1_image`, {
            status: 'NOT_VISIBLE',
            error: 'Asset \'projects/p/assets/run1_image\' does not exist or doesn\'t allow this operation.'
        })

        const result = await cleanup({assets})

        expect(result.status).toBe('INCOMPLETE')
        expect(result.deleted).not.toContain(`${PARENT}/run1_image`)
        expect(result.failures).toEqual([expect.objectContaining({
            assetId: `${PARENT}/run1_image`,
            status: 'NOT_VISIBLE',
            error: expect.stringContaining('does not exist or doesn\'t allow this operation')
        })])
    })

    it('reports the remainder as unknown when the listing cannot be repeated', async () => {
        const assets = scratchAssets()
        let listings = 0
        const listAssets = async parent => ++listings > 2
            ? {status: 'TRANSPORT', error: 'socket hang up'}
            : await assets.listAssets(parent)

        const result = await cleanup({assets, listAssets})

        expect(result.remainingListed).toBe('UNKNOWN')
        expect(result.remainingFailure).toEqual({status: 'TRANSPORT', error: 'socket hang up'})
    })

    it('leaves a collection in place when its tiles cannot be listed', async () => {
        const assets = scratchAssets()
        assets.refuse(`list:${PARENT}/run1_collection`, {status: 'TRANSPORT', error: 'socket hang up'})

        const result = await cleanup({assets})

        expect(result.status).toBe('INCOMPLETE')
        expect(result.failures).toEqual([expect.objectContaining({
            assetId: `${PARENT}/run1_collection`, phase: 'LIST_CHILDREN'
        })])
        expect(assets.ids()).toContain(`${PARENT}/run1_collection`)
        expect(assets.ids()).toContain(`${PARENT}/run1_collection/0`)
    })

    it('reports nothing deleted when the scratch folder cannot be listed', async () => {
        const result = await cleanup({
            assets: scratchAssets(),
            listAssets: async () => ({status: 'PERMISSION_DENIED', error: 'Permission denied'})
        })

        expect(result.status).toBe('LISTING_FAILED')
        expect(result.deleted).toEqual([])
        expect(result.remainingListed).toBe('UNKNOWN')
    })
})

describe('what a mode is allowed to do', () => {
    it('provisions scratch storage for a mode that writes fixtures', async () => {
        const harness = modeHarness()

        expect(await runMode({...harness, mode: 'image'})).toEqual({status: 'WROTE'})
        expect(harness.calls).toEqual(['authenticate', 'provisionStorage'])
    })

    it('authenticates a read-only mode without provisioning storage', async () => {
        const harness = modeHarness()

        expect(await runMode({...harness, mode: 'read'})).toEqual({status: 'READ'})
        expect(harness.calls).toEqual(['authenticate'])
    })

    it('does not provision storage to delete', async () => {
        const harness = modeHarness()

        await runMode({...harness, mode: 'cleanup'})

        expect(harness.calls).toEqual(['authenticate'])
    })

    it('neither authenticates nor provisions an offline mode', async () => {
        const harness = modeHarness()

        expect(await runMode({...harness, mode: 'plan'})).toEqual({status: 'PLANNED'})
        expect(harness.calls).toEqual([])
    })

    it('names the modes it knows when given one it does not', async () => {
        const harness = modeHarness()

        await expect(runMode({...harness, mode: 'nonsense'}))
            .rejects.toThrow(/Unknown mode 'nonsense'.*plan, read, image, cleanup/)
        expect(harness.calls).toEqual([])
    })
})

const task = ({run = RUN, name, state}) => ({
    name: `projects/p/operations/${name}`,
    metadata: {state, description: `${run}_${name}`}
})

// The wrapper the Earth Engine client puts around a response object.
const serializable = ({name, metadata}) => ({
    Serializable$values: {name, metadata: {Serializable$values: metadata}}
})

const guardOver = pages => createDeletionGuard({runId: RUN, data: earthEngine({pages})})

// Mirrors the installed client: a limit both truncates the accumulated list and stops it following
// nextPageToken; without one every page is followed.
const earthEngine = ({pages = [], error} = {}) => ({
    listOperations: (limit, callback) => setImmediate(() => {
        if (error) {
            return callback(null, error)
        }
        const operations = []
        for (const page of pages) {
            operations.push(...page)
            if (limit && operations.length >= limit) {
                break
            }
        }
        callback(limit ? operations.slice(0, limit) : operations)
    })
})

const scratchAssets = () => {
    const present = new Map([
        [`${PARENT}/run1_image`, 'IMAGE'],
        [`${PARENT}/run1_collection`, 'IMAGE_COLLECTION'],
        [`${PARENT}/run1_collection/0`, 'IMAGE'],
        [`${PARENT}/run2_image`, 'IMAGE']
    ])
    const refusals = new Map()
    return {
        listAssets: async parent => refusals.get(`list:${parent}`) || {
            status: 'OK',
            assets: [...present.entries()]
                .filter(([id]) => id.startsWith(`${parent}/`) && !id.slice(parent.length + 1).includes('/'))
                .map(([id, type]) => ({id, type}))
        },
        deleteAsset: async id => {
            const refusal = refusals.get(`delete:${id}`)
            if (refusal) {
                return refusal
            }
            present.delete(id)
            return {status: 'DELETED'}
        },
        refuse: (key, result) => refusals.set(key, result),
        ids: () => [...present.keys()]
    }
}

const cleanup = ({assets, guard = async () => ({allowed: true, tasks: []}), listAssets}) => cleanupScratch({
    parent: PARENT,
    guard,
    listAssets: listAssets || assets.listAssets,
    deleteAsset: assets.deleteAsset,
    owns: id => id.startsWith(`${PARENT}/${RUN}_`)
})

const modeHarness = () => {
    const calls = []
    return {
        calls,
        modes: {
            plan: {run: async () => ({status: 'PLANNED'}), offline: true},
            read: {run: async () => ({status: 'READ'})},
            image: {run: async () => ({status: 'WROTE'}), createsFixtures: true},
            cleanup: {run: async () => ({status: 'CLEANED'})}
        },
        authenticate: async () => calls.push('authenticate'),
        provisionStorage: async () => calls.push('provisionStorage')
    }
}
