import {jest} from '@jest/globals'
import {AsyncLocalStorage} from 'async_hooks'
import {firstValueFrom, Observable, of, switchMap} from 'rxjs'
import {MessageChannel} from 'worker_threads'

// Who each Earth Engine request is sent as when jobs of different users share one worker thread and their calls
// queue behind one another. The real job boundary, REST client and limiter - reached over a real MessagePort, as
// a worker thread reaches it - with only Earth Engine's answers substituted.

jest.unstable_mockModule('#gee/config', () => ({
    googleProjectId: 'sepal-test-project',
    instances: 1,
    port: 80,
    recipeEndpoint: 'http://recipe',
    sepalEndpoint: 'http://test',
    serviceAccountCredentials: {}
}))

const {WORKER} = await import('#sepal/worker/factory')
const {PortTransport} = await import('#sepal/rxjs/transport/port')
const service = await import('#sepal/service')
const {addServices} = await import('#sepal/service/registry')
const {LimiterService} = await import('#sepal/service/limiter')
const {EERestClient} = await import('#sepal/ee/rest/eeRestClient')
const {job} = await import('#gee/jobs/job')
const {initializeOfflineEE, TEST_PROJECT} = await import('../support/eeOffline.js')

const SHARED_PROJECT = 'shared-user-project'
const HOUR = 60 * 60 * 1000

const ee = await initializeOfflineEE()

const {limiterService, limiter$} = LimiterService('IsolationTestLimiter', {
    tiers: [
        {name: 'user', key: ({username}) => username, limits: () => ({maxConcurrency: 10})},
        {name: 'project', key: ({projectId}) => projectId, limits: () => ({maxConcurrency: 1})}
    ]
})
addServices([limiterService])

// Both ends share one transport id, as a worker and its host do.
const TRANSPORT = 'isolation-test-worker'
const ports = new MessageChannel()
PortTransport({
    transportId: TRANSPORT,
    port: ports.port1,
    onChannel: ({conversationGroupId: serviceName, in$: response$, out$: request$}) =>
        serviceName && service.start(serviceName, request$, response$)
})
service.initialize(PortTransport({transportId: TRANSPORT, port: ports.port2, onChannel: () => {}}))

afterAll(() => {
    ports.port1.close()
    ports.port2.close()
})

const sent = []

// An answer resumes in the async context its request was made in, as a real HTTP response does.
const http = {
    postJson$: (url, {headers, body}) => new Observable(subscriber => {
        const resume = AsyncLocalStorage.snapshot()
        sent.push({
            url,
            authorization: headers.Authorization,
            imageId: body.expression.values[body.expression.result].functionInvocationValue.arguments.id.constantValue,
            answer: () => resume(() => {
                subscriber.next({statusCode: 200, body: {result: 1}})
                subscriber.complete()
            })
        })
    })
}

ee.setTransport(new EERestClient({
    ee,
    http,
    limiter$,
    serviceAccountToken$: () => of({accessToken: 'service-account-token'})
}))

// The second call is made once the first has answered, so it starts from wherever that answer resumed.
const twoCallJob = job({
    jobName: 'test two calls',
    before: [],
    worker$: ({requestArgs: {first, second}}) =>
        ee.getInfo$(ee.Image(first), 'first').pipe(
            switchMap(() => ee.getInfo$(ee.Image(second), 'second'))
        )
})

test('each request is sent as the user whose job made it, however their calls interleave', async () => {
    const alices = run(ALICE, {first: 'alice-1', second: 'alice-2'})
    await until(() => sent.length === 1)
    const bobs = run(BOB, {first: 'bob-1', second: 'bob-2'})
    const carols = run(CAROL_WITHOUT_GOOGLE_ACCOUNT, {first: 'carol-1', second: 'carol-2'})
    await until(() => sent.length === 2)
    expect(sent.map(({imageId}) => imageId)).toEqual(['alice-1', 'carol-1'])

    await answerUntilAllSent(6)
    await Promise.all([alices, bobs, carols])

    expect(sentAs()).toEqual({
        'alice-1': {authorization: 'Bearer alice-token', project: SHARED_PROJECT},
        'alice-2': {authorization: 'Bearer alice-token', project: SHARED_PROJECT},
        'bob-1': {authorization: 'Bearer bob-token', project: SHARED_PROJECT},
        'bob-2': {authorization: 'Bearer bob-token', project: SHARED_PROJECT},
        'carol-1': {authorization: 'Bearer service-account-token', project: TEST_PROJECT},
        'carol-2': {authorization: 'Bearer service-account-token', project: TEST_PROJECT}
    })
})

const userWithGoogleAccount = (username, projectId) => ({
    username,
    roles: [],
    googleTokens: {accessToken: `${username}-token`, accessTokenExpiryDate: Date.now() + HOUR, projectId}
})

const ALICE = userWithGoogleAccount('alice', SHARED_PROJECT)
const BOB = userWithGoogleAccount('bob', SHARED_PROJECT)
const CAROL_WITHOUT_GOOGLE_ACCOUNT = {username: 'carol', roles: []}

const run = (sepalUser, requestArgs) => {
    const [task] = twoCallJob(WORKER)
    return firstValueFrom(task.worker$({
        requestArgs,
        credentials: {sepalUser, googleProjectId: TEST_PROJECT},
        requestId: sepalUser.username,
        state: {}
    }))
}

const answerUntilAllSent = async count => {
    while (sent.length < count || sent.some(request => !request.answered)) {
        const next = sent.find(request => !request.answered)
        if (next) {
            next.answered = true
            next.answer()
        }
        await settle()
    }
}

const until = async condition => {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await settle()
    }
    expect(condition()).toBe(true)
}

const settle = () => new Promise(resolve => setTimeout(resolve, 5))

const sentAs = () => Object.fromEntries(
    sent.map(({imageId, authorization, url}) => [imageId, {authorization, project: url.match(/v1\/projects\/([^/]+)\//)[1]}])
)
