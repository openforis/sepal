import {jest} from '@jest/globals'

import {CLIENT_UP, USER_DOWN} from '#sepal/event/definitions'
import {configureNoLogging} from '#sepal/log'

// Redis session state and the storage scanner are this handler's other two boundaries; both are stubbed
// at the module edge so the test can watch what reaches the inactivity check.
const setSessionActive = jest.fn(async () => undefined)
const setSessionInactive = jest.fn(async () => undefined)
const scheduleStorageCheck = jest.fn(async () => undefined)

jest.unstable_mockModule('./kvstore.js', () => ({setSessionActive, setSessionInactive}))
jest.unstable_mockModule('./storageCheck.js', () => ({scheduleStorageCheck}))

const {createMessageHandler} = await import('./messageHandler.js')

describe('the message handler', () => {
    let inactivityCheck
    let scheduled
    let cancelled

    beforeAll(() => configureNoLogging())

    beforeEach(() => {
        scheduled = []
        cancelled = []
        setSessionActive.mockClear()
        setSessionInactive.mockClear()
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

        expect(setSessionActive).toHaveBeenCalledWith(USERNAME)
        expect(cancelled).toEqual([USERNAME])
        expect(scheduled).toEqual([])
    })

    test('schedules a check for a user whose session closed', async () => {
        await deliver('workerSession.WorkerSessionClosed', {username: USERNAME})

        expect(setSessionInactive).toHaveBeenCalledWith(USERNAME)
        expect(scheduled).toEqual([USERNAME])
        expect(cancelled).toEqual([])
    })

    test('cancels the check for a user whose client came up', async () => {
        await deliver('systemEvent', {type: CLIENT_UP, data: {username: USERNAME}})

        expect(cancelled).toEqual([USERNAME])
    })

    test('schedules a check for a user who went away', async () => {
        await deliver('systemEvent', {type: USER_DOWN, data: {user: {username: USERNAME}}})

        expect(scheduled).toEqual([USERNAME])
    })

    test('leaves the check alone when a user deletes files', async () => {
        await deliver('files.FilesDeleted', {username: USERNAME})

        expect(scheduled).toEqual([])
        expect(cancelled).toEqual([])
    })

    test('ignores a message that names no user', async () => {
        await expect(deliver('workerSession.WorkerSessionClosed', {})).resolves.toBeUndefined()

        expect(setSessionInactive).not.toHaveBeenCalled()
        expect(scheduled).toEqual([])
    })

    test('ignores a message it has no handler for', async () => {
        await expect(deliver('something.Unknown', {username: USERNAME})).resolves.toBeUndefined()

        expect(scheduled).toEqual([])
        expect(cancelled).toEqual([])
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

        expect(scheduled).toEqual([ANOTHER_USERNAME])
    })

    const deliver = async (key, message) => {
        const result = await createMessageHandler({inactivityCheck})(key, message)
        await drain()
        return result
    }

    // The streams answer on a promise, so the microtask queue has to run before the calls are visible.
    const drain = () => new Promise(resolve => setImmediate(resolve))

    const USERNAME = 'bob'
    const ANOTHER_USERNAME = 'alice'
})
