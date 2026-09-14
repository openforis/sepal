import {jest} from '@jest/globals'
import {createServer} from 'http'
import {Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

// The requests a running task actually sends back to SEPAL, over real HTTP against a server standing
// in for the gateway. The task itself is substituted: what it computes is not what this is about.

const SEPAL_API_KEY = 'session-api-key'
const TASK_ID = 'task-1'
const NEVER_ARRIVES_MS = 5000
// Longer than the diagnostic deadline, so the fail-safe gets to report before the runner gives up.
const TEST_TIMEOUT_MS = 10000

const requests = []

let config
let progress$
let waitingForRequest

jest.unstable_mockModule('#task/context', () => ({
    getConfig: () => config,
    getContext$: () => new Subject(),
    switchedToServiceAccount$: new Subject()
}))

jest.unstable_mockModule('#task/taskRunner', () => ({
    default: () => progress$
}))

const gateway = await startGateway()

config = {
    sepalEndpoint: `http://127.0.0.1:${gateway.address().port}`,
    sepalApiKey: SEPAL_API_KEY
}

const {submitTask} = await import('#task/taskManager')

describe('the callbacks of a running task', () => {
    beforeAll(() => configureNoLogging())

    beforeEach(() => {
        requests.length = 0
        waitingForRequest = []
        progress$ = new Subject()
    })

    // The manager repeats the last progress as a heartbeat until the task ends, so each case ends
    // its own task rather than leaving a timer behind.
    afterEach(() => progress$.complete())

    afterAll(() => new Promise(resolve => gateway.close(resolve)))

    test('report progress as the session the executor runs as', async () => {
        submitTask({id: TASK_ID, name: 'download', params: {}})

        progress$.next({state: 'ACTIVE', defaultMessage: 'Half way'})
        const request = await requestTo('/api/tasks/active')

        expect(request.authorization).toBe(apiKeyAuth(SEPAL_API_KEY))
        expect(JSON.parse(request.query.get('progress'))).toEqual({
            [TASK_ID]: {state: 'ACTIVE', defaultMessage: 'Half way'}
        })
    }, TEST_TIMEOUT_MS)

    test('report completion as the session the executor runs as', async () => {
        submitTask({id: TASK_ID, name: 'download', params: {}})

        progress$.next({state: 'COMPLETED'})
        const request = await requestTo(`/api/tasks/task/${TASK_ID}/state-updated`)

        expect(request.authorization).toBe(apiKeyAuth(SEPAL_API_KEY))
        expect(new URLSearchParams(request.body).get('state')).toBe('COMPLETED')
    }, TEST_TIMEOUT_MS)
})

const apiKeyAuth = apiKey => `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`

// The first request to reach the given path, resolved as the server receives it, so the notification
// windows the manager applies stay out of the test. The fail-safe is not a wait: without it a
// request that never arrives would end as a bare runner timeout naming nothing.
const requestTo = path => new Promise((resolve, reject) => {
    const received = requests.find(recorded => recorded.path === path)
    if (received) {
        resolve(received)
        return
    }
    const waiter = {
        path,
        resolve: request => {
            clearTimeout(failSafe)
            resolve(request)
        }
    }
    const failSafe = setTimeout(() => {
        waitingForRequest = waitingForRequest.filter(pending => pending !== waiter)
        reject(new Error(
            `No request to ${path}; saw ${JSON.stringify(requests.map(({path: seen}) => seen))}`
        ))
    }, NEVER_ARRIVES_MS)
    waitingForRequest.push(waiter)
})

const record = request => {
    requests.push(request)
    const index = waitingForRequest.findIndex(({path}) => path === request.path)
    index !== -1 && waitingForRequest.splice(index, 1)[0].resolve(request)
}

function startGateway() {
    return new Promise(resolve => {
        const server = createServer((request, response) => {
            const url = new URL(request.url, 'http://gateway')
            const chunks = []
            request.on('data', chunk => chunks.push(chunk))
            request.on('end', () => {
                record({
                    path: url.pathname,
                    query: url.searchParams,
                    authorization: request.headers.authorization,
                    body: Buffer.concat(chunks).toString()
                })
                response.statusCode = 204
                response.end()
            })
        })
        server.listen(0, '127.0.0.1', () => resolve(server))
    })
}
