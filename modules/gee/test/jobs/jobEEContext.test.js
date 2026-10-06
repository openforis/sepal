import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// Who a job's Earth Engine calls are made as: established by the job boundary from the request's credentials,
// for every task the job runs.

jest.unstable_mockModule('#gee/config', () => ({
    googleProjectId: 'sepal-test-project',
    instances: 1,
    port: 80,
    recipeEndpoint: 'http://recipe',
    sepalEndpoint: 'http://test',
    serviceAccountCredentials: {}
}))

const {WORKER} = await import('#sepal/worker/factory')
const {currentEEContext, DEFAULT_EE_ENDPOINT} = await import('#sepal/ee/eeContext')
const {job} = await import('#gee/jobs/job')

const SEPAL_PROJECT = 'sepal-test-project'
const HIGH_VOLUME_ENDPOINT = 'https://earthengine-highvolume.googleapis.com'
const HOUR = 60 * 60 * 1000

const contextJob = job({
    jobName: 'Test Context Probe',
    before: [],
    workloadTag: requestArgs => requestArgs?.workloadTag,
    worker$: () => of(currentEEContext())
})

describe('the Earth Engine context a job runs in', () => {
    test('is the user\'s own, in the user\'s project, for a user with a Google account', async () => {
        const googleTokens = tokens({projectId: 'alice-project'})

        const context = await contextOf({sepalUser: {username: 'alice', googleTokens}})

        expect(context).toEqual({
            requestId: 'request-1',
            username: 'alice',
            origin: 'interactive',
            auth: {type: 'user', accessToken: googleTokens.accessToken, expiresAt: googleTokens.accessTokenExpiryDate},
            projectId: 'alice-project',
            workloadTag: 'sepal-work-test_context_probe',
            endpoint: DEFAULT_EE_ENDPOINT
        })
    })

    test('is in the SEPAL project for a user whose Google account names no project', async () => {
        const context = await contextOf({sepalUser: {username: 'alice', googleTokens: tokens()}})

        expect(context).toMatchObject({auth: {type: 'user'}, projectId: SEPAL_PROJECT})
    })

    test('is the service account\'s, in the SEPAL project, for a user without a Google account', async () => {
        const context = await contextOf({sepalUser: {username: 'bob'}})

        expect(context).toMatchObject({username: 'bob', auth: {type: 'serviceAccount'}, projectId: SEPAL_PROJECT})
    })

    test('is the service account\'s for a request without a user', async () => {
        const context = await contextOf({})

        expect(context).toMatchObject({username: null, auth: {type: 'serviceAccount'}, projectId: SEPAL_PROJECT})
    })

    test('is refused for a user whose Google token has expired', async () => {
        const expired = tokens({accessTokenExpiryDate: Date.now() - 1000})

        await expect(contextOf({sepalUser: {username: 'alice', googleTokens: expired}})).rejects.toThrow(/Token expired/)
    })

    test('goes to the endpoint the job asks for', async () => {
        const context = await contextOf({sepalUser: {username: 'bob'}}, {eeEndpoint: HIGH_VOLUME_ENDPOINT})

        expect(context.endpoint).toBe(HIGH_VOLUME_ENDPOINT)
    })

    test('is task traffic for a request authenticated with a task container\'s key', async () => {
        const context = await contextOf({sepalUser: {username: 'bob'}, sepalSession: {workerType: 'task', taskId: 't-1'}})

        expect(context.origin).toBe('task')
    })

    test('is interactive for a sandbox session\'s request', async () => {
        const context = await contextOf({sepalUser: {username: 'bob'}, sepalSession: {workerType: 'sandbox', sessionId: 's-1'}})

        expect(context.origin).toBe('interactive')
    })

    test('carries the workload tag the job derives from its request, when it derives one', async () => {
        const context = await contextOf({sepalUser: {username: 'bob'}, requestArgs: {workloadTag: 'sepal-task-mosaic'}})

        expect(context.workloadTag).toBe('sepal-task-mosaic')
    })
})

const tokens = overrides => ({
    accessToken: 'alice-token',
    accessTokenExpiryDate: Date.now() + HOUR,
    ...overrides
})

const contextOf = ({sepalUser, sepalSession, requestArgs}, initArgs) => {
    const [probe] = contextJob(WORKER)
    return firstValueFrom(probe.worker$({
        requestArgs,
        credentials: {sepalUser, sepalSession, googleProjectId: SEPAL_PROJECT},
        requestId: 'request-1',
        initArgs,
        state: {}
    }))
}
