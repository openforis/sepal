// The lifecycle of one hand-run probe: which mode runs and what that mode may create, which of this run's
// Earth Engine tasks are unfinished, and removing what the run created.
//
// Cleanup and reruns are fresh processes, so whatever the run that started an export knew about its
// destination is gone by the time anything would delete it. Earth Engine's operation listing is the only thing
// left that can say whether a task is still writing there, and only an explicitly terminal state establishes
// that one is finished with it: an unrecognised state, and a listing that did not succeed, both leave every
// destination in place.

import {failure} from './eeFailures.mjs'

export const TERMINAL_TASK_STATES = ['COMPLETED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'CANCELED']

export const isTerminal = state => TERMINAL_TASK_STATES.includes(state)

// Authentication establishes the client and nothing else, so reading, inspecting and cleaning up need no
// permission to create a scratch folder. Only a mode that writes fixtures provisions one.
export const runMode = async ({modes, mode, authenticate, provisionStorage}) => {
    const selected = modes[mode]
    if (!selected) {
        throw new Error(`Unknown mode '${mode}'. One of: ${Object.keys(modes).join(', ')}`)
    }
    if (!selected.offline) {
        await authenticate()
    }
    if (selected.createsFixtures) {
        await provisionStorage()
    }
    return await selected.run()
}

// `data` is ee.data. A run's tasks are the ones its own exports named, which is why every description carries
// the run id.
export const createDeletionGuard = ({runId, data}) => async () => {
    let unfinished
    try {
        unfinished = await unfinishedTasks(data)
    } catch (error) {
        return {allowed: false, reason: 'task states could not be established', tasks: [], failure: failure(error)}
    }
    const mine = unfinished.filter(({description}) => String(description || '').startsWith(`${runId}_`))
    return mine.length
        ? {allowed: false, reason: `${mine.length} task(s) of this run are not in a terminal state`, tasks: mine}
        : {allowed: true, tasks: unfinished}
}

// Only what this run created: a namespace is shared with every other run, and a run that deletes another's
// assets destroys evidence it cannot replace. Only a delete Earth Engine accepted counts as one; everything
// else is a failure, and the count that follows is of what the listing showed - an asset Earth Engine will not
// show this caller is absent from it either way, so it is no evidence of removal.
export const cleanupScratch = async ({parent, guard, listAssets, deleteAsset, owns}) => {
    const permission = await guard()
    if (!permission.allowed) {
        return {
            status: 'SKIPPED', reason: permission.reason, tasks: permission.tasks,
            ...(permission.failure ? {taskFailure: permission.failure} : {}),
            deleted: [], skipped: [], failures: [], remainingListed: 'UNKNOWN'
        }
    }
    const listed = await listAssets(parent)
    if (listed.status !== 'OK') {
        return {status: 'LISTING_FAILED', failure: listed, deleted: [], skipped: [], failures: [], remainingListed: 'UNKNOWN'}
    }
    const deleted = []
    const skipped = []
    const failures = []
    for (const {id, type} of listed.assets) {
        if (!owns(id)) {
            skipped.push(id)
            continue
        }
        if (type === 'IMAGE_COLLECTION') {
            const children = await listAssets(id)
            if (children.status !== 'OK') {
                failures.push({assetId: id, phase: 'LIST_CHILDREN', failure: children})
                continue
            }
            for (const child of children.assets) {
                await remove(child.id, deleteAsset, deleted, failures)
            }
        }
        await remove(id, deleteAsset, deleted, failures)
    }
    const after = await listAssets(parent)
    return {
        status: failures.length ? 'INCOMPLETE' : 'DONE',
        deleted,
        skipped,
        failures,
        remainingListed: after.status === 'OK' ? after.assets.filter(({id}) => owns(id)).length : 'UNKNOWN',
        ...(after.status === 'OK' ? {} : {remainingFailure: after}),
        outstandingTasks: permission.tasks
    }
}

// Without a limit: a limit both truncates the accumulated list and stops the client following nextPageToken,
// so a task of this run on a later page would go unseen.
const unfinishedTasks = async data => {
    const operations = await callbackPromise(callback =>
        data.listOperations(undefined, (result, error) => callback(result, error))
    )
    return (operations || [])
        .map(operation => operation?.Serializable$values || operation)
        .map(({name, metadata}) => {
            const {state, description} = metadata?.Serializable$values || metadata || {}
            return {name, state, description}
        })
        .filter(({state}) => !isTerminal(state))
}

const remove = async (assetId, deleteAsset, deleted, failures) => {
    const removal = await deleteAsset(assetId)
    removal.status === 'DELETED' ? deleted.push(assetId) : failures.push({assetId, ...removal})
}

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})
