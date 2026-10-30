import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

const jobs = []
let processJob

mock.module('bullmq', {namedExports: {
    Queue: class {
        on() {}

        async add(name, data, {jobId}) {
            jobs.push({id: jobId, data})
        }
    },
    QueueEvents: class {
        on() {}
    },
    Worker: class {
        constructor(_name, processor) {
            processJob = processor
        }
    }
}})
mock.module('ioredis', {namedExports: {Redis: class {}}})
mock.module('./cache.js', {namedExports: {
    getEmailNotificationsEnabled: async () => undefined,
    setEmailNotificationsEnabled: async () => {},
    setEmailNotificationsEnabledIfAbsent: async () => {}
}})
// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {exports: {concurrency: 1, redisHost: 'redis.test'}})

const send = mock.fn(async () => {})
mock.module('./email.js', {namedExports: {send, tag: () => ''}})

const getUser = mock.fn()
mock.module('./http.js', {namedExports: {getUser, getEmailNotificationsEnabled: async () => true}})

const {initQueue} = await import('./emailQueue.js')
const {messageHandler} = await import('./messageHandler.js')
await initQueue()

const username = 'alice'
const email = 'alice@example.org'

beforeEach(() => {
    jobs.length = 0
    send.mock.resetCalls()
    getUser.mock.resetCalls()
    getUser.mock.mockImplementation(async () => ({email, status: 'ACTIVE'}))
})

test('sends an email to a user whose address lookup failed once it succeeds on a retry', async () => {
    getUser.mock.mockImplementationOnce(async () => {
        throw new Error('503 user service unavailable')
    })

    await messageHandler('email.sendToUser', sendToUser())
    const [job] = jobs

    await assert.rejects(processJob(job), /503/)
    assert.equal(send.mock.callCount(), 0)
    await processJob(job)
    assert.deepEqual(send.mock.calls.map(({arguments: [{email: {to}}]}) => to), [[email]])
})

test('does not email a locked user', async () => {
    getUser.mock.mockImplementation(async () => ({email, status: 'LOCKED'}))

    await messageHandler('email.sendToUser', sendToUser())
    await processJob(jobs[0])

    assert.equal(send.mock.callCount(), 0)
})

test('does not email a user without an address', async () => {
    getUser.mock.mockImplementation(async () => ({status: 'ACTIVE'}))

    await messageHandler('email.sendToUser', sendToUser())
    await processJob(jobs[0])

    assert.equal(send.mock.callCount(), 0)
})

const sendToUser = () => ({username, subject: 'Your data will be deleted', content: 'Log in to keep it'})
