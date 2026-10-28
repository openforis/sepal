import assert from 'node:assert/strict'
import {before, beforeEach, describe, mock, test} from 'node:test'

import {CLIENT_UP, USER_DOWN} from '#sepal/event/definitions'
import {configureNoLogging} from '#sepal/log'
import {callsOf} from '#sepal/testSupport/mock'

// Redis session state and the storage scanner are this handler's other two boundaries; both are stubbed
// at the module edge so the test can watch what reaches the inactivity check.
const setSessionActive = mock.fn(async () => undefined)
const setSessionInactive = mock.fn(async () => undefined)
const scheduleRescan = mock.fn(async () => undefined)

mock.module('./kvstore.js', {
    exports: {
        setSessionActive,
        setSessionInactive
    }
})
mock.module('./storageCheck.js', {
    exports: {
        scheduleRescan
    }
})

const {createMessageHandler} = await import('./messageHandler.js')

describe('the message handler', () => {
    let inactivityCheck
    let scheduled
    let cancelled

    before(() => configureNoLogging())

    beforeEach(() => {
        scheduled = []
        cancelled = []
        setSessionActive.mock.resetCalls()
        setSessionInactive.mock.resetCalls()
        scheduleRescan.mock.resetCalls()
        inactivityCheck = {
            scheduleInactivityCheck: async ({username}) => {
                scheduled.push(username)
            },
            cancelInactivityCheck: async ({username}) => {
                cancelled.push(username)
            }
        }
    })

    test('cancels the check for a user whose session became active', async () => {
        await deliver('workerSession.WorkerSessionActivated', {username: USERNAME})

        assert.deepEqual(callsOf(setSessionActive), [[USERNAME]])
        assert.deepEqual(cancelled, [USERNAME])
        assert.deepEqual(scheduled, [])
    })

    test('schedules a check for a user whose session closed', async () => {
        await deliver('workerSession.WorkerSessionClosed', {username: USERNAME})

        assert.deepEqual(callsOf(setSessionInactive), [[USERNAME]])
        assert.deepEqual(scheduled, [USERNAME])
        assert.deepEqual(cancelled, [])
    })

    test('cancels the check for a user whose client came up', async () => {
        await deliver('systemEvent', {type: CLIENT_UP, data: {username: USERNAME}})

        assert.deepEqual(cancelled, [USERNAME])
    })

    test('schedules a check for a user who went away', async () => {
        await deliver('systemEvent', {type: USER_DOWN, data: {user: {username: USERNAME}}})

        assert.deepEqual(scheduled, [USERNAME])
    })

    test('rescans the storage of a user who deleted files', async () => {
        await deliver('files.FilesDeleted', {username: USERNAME})
        await debounced()

        assert.deepEqual(rescansOf('filesDeleted'), [{username: USERNAME, type: 'filesDeleted'}])
    })

    test('leaves the check alone when a user deletes files', async () => {
        await deliver('files.FilesDeleted', {username: USERNAME})

        assert.deepEqual(scheduled, [])
        assert.deepEqual(cancelled, [])
    })

    test('ignores a message that names no user', async () => {
        assert.equal(await deliver('workerSession.WorkerSessionClosed', {}), undefined)

        assert.equal(setSessionInactive.mock.callCount(), 0)
        assert.deepEqual(scheduled, [])
    })

    test('ignores a message it has no handler for', async () => {
        assert.equal(await deliver('something.Unknown', {username: USERNAME}), undefined)

        assert.deepEqual(scheduled, [])
        assert.deepEqual(cancelled, [])
    })

    // The subscription is long-lived: one user's failure must not stop the next user's event.
    test('keeps handling messages after a scheduling failure', async () => {
        inactivityCheck.scheduleInactivityCheck = async ({username}) => {
            if (username === USERNAME) {
                throw new Error('redis is down')
            }
            scheduled.push(username)
        }
        const handler = createMessageHandler({inactivityCheck})

        await handler('workerSession.WorkerSessionClosed', {username: USERNAME})
        await drain()
        await handler('workerSession.WorkerSessionClosed', {username: ANOTHER_USERNAME})
        await drain()

        assert.deepEqual(scheduled, [ANOTHER_USERNAME])
    })

    const deliver = async (key, message) => {
        const result = await createMessageHandler({inactivityCheck})(key, message)
        await drain()
        return result
    }

    // The streams answer on a promise, so the microtask queue has to run before the calls are visible.
    const drain = () => new Promise(resolve => setImmediate(resolve))

    // Rescan requests are debounced per event for a second.
    const debounced = () => new Promise(resolve => setTimeout(resolve, 1100))

    // Earlier tests' handlers keep running, so their debounced session rescans can land here too.
    const rescansOf = type =>
        callsOf(scheduleRescan).map(([request]) => request).filter(request => request.type === type)

    const USERNAME = 'bob'
    const ANOTHER_USERNAME = 'alice'
})
