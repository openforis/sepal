import {jest} from '@jest/globals'
import {of} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

// The queue, Redis, the home directory scanner and the gateway are this check's boundaries; they are stubbed at the
// module edge so a job can be run directly and the announcement observed on the real publisher.
let processJob
const storageSizes = {}
const eraseUserStorage = jest.fn(async () => undefined)

jest.unstable_mockModule('bullmq', () => ({
    Job: {fromId: async () => ({data: {}})},
    Queue: class {
        add = async () => undefined
        remove = async () => undefined
    },
    QueueEvents: class {
        on() {}
    },
    Worker: class {
        constructor(_queue, processor) {
            processJob = processor
        }
    }
}))
jest.unstable_mockModule('ioredis', () => ({Redis: class {}}))
jest.unstable_mockModule('./config.js', () => ({
    inactivityConcurrency: 1,
    inactivityGracePeriod: 0,
    inactivityInitialRetryDelay: 0,
    inactivityMaxRetries: 1,
    inactivityMaxSpread: 0,
    inactivityNotificationDelay: 0,
    inactivityTimeout: 1000,
    inactivityUserStorageThreshold: 100,
    redisHost: 'redis'
}))
jest.unstable_mockModule('./kvstore.js', () => ({
    DB: {INACTIVITY_QUEUE: 0},
    getInitialized: async () => true,
    getUserStorage: async username => storageSizes[username],
    setInitialized: async () => undefined
}))
jest.unstable_mockModule('./filesystem.js', () => ({eraseUserStorage}))
jest.unstable_mockModule('./http.js', () => ({
    getMostRecentAccess$: () => of(LONG_AGO),
    getMostRecentAccessByUser$: () => of({}),
    getUser$: () => of({name: 'Alice'})
}))
jest.unstable_mockModule('./email.js', () => ({sendEmail: async () => undefined}))

const {STORAGE_PUBLISHERS} = await import('./events.js')
const {InactivityCheck} = await import('./inactivityCheck.js')

describe('erasing an inactive user\'s storage', () => {
    let recorded
    let announced
    let subscription

    beforeAll(() => configureNoLogging())

    beforeEach(() => {
        recorded = []
        announced = []
        eraseUserStorage.mockClear()
        subscription = STORAGE_PUBLISHERS
            .find(({key}) => key === 'storage.UserStorageErased').publish$
            .subscribe(({username}) => announced.push(username))
    })

    afterEach(() => subscription.unsubscribe())

    test('announces the erase of a user with significant storage', async () => {
        storageSizes[USERNAME] = '1000'
        await startedCheck(recordingRepository())

        await processJob(eraseJob())

        expect(announced).toEqual([USERNAME])
        expect(recorded).toEqual(['PURGED'])
    })

    test('announces the erase even when recording the purge fails', async () => {
        storageSizes[USERNAME] = '1000'
        await startedCheck({addEvent: async () => { throw new Error('db down') }})

        await expect(processJob(eraseJob())).rejects.toThrow('db down')

        expect(announced).toEqual([USERNAME])
    })

    test('announces nothing for a user with negligible storage', async () => {
        storageSizes[USERNAME] = '10'
        await startedCheck(recordingRepository())

        await processJob(eraseJob())

        expect(announced).toEqual([])
        expect(eraseUserStorage).not.toHaveBeenCalled()
    })

    test('announces nothing for a user with unknown storage', async () => {
        delete storageSizes[USERNAME]
        await startedCheck(recordingRepository())

        await expect(processJob(eraseJob())).rejects.toThrow()

        expect(announced).toEqual([])
        expect(eraseUserStorage).not.toHaveBeenCalled()
    })

    const startedCheck = async repository => {
        await new InactivityCheck({repository}).startInactivityCheck()
    }

    const recordingRepository = () => ({
        addEvent: async ({event}) => {
            recorded.push(event)
        }
    })
})

const eraseJob = () => ({data: {username: USERNAME, action: 'erase'}})

const USERNAME = 'alice'
const LONG_AGO = new Date('2020-01-01T00:00:00Z')
