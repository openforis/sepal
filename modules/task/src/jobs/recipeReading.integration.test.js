import {jest} from '@jest/globals'
import {createServer} from 'http'
import {defaultIfEmpty, EMPTY, firstValueFrom, forkJoin, of} from 'rxjs'

// What a task ends up reading a recipe with, from its own configuration operation through to the
// request the shared loader issues: over real HTTP, against a server standing in for the gateway.

const SEPAL_API_KEY = 'session-api-key'

const requests = []

let config
let answer

jest.unstable_mockModule('#task/jobs/service/context', () => ({
    contextService: {serviceName: 'ContextService', serviceHandler$: () => of({})},
    getCurrentContext$: () => of({config})
}))

const {WORKER} = await import('#sepal/worker/factory')
const {loadRecipe$} = await import('#sepal/ee/recipe')
const {job} = await import('#task/jobs/job')
const {default: configureJob} = await import('#task/jobs/configure')

// A job like any other in this module: it reads recipes and knows nothing about operations.
const readingJob = job({
    jobName: 'test read recipes',
    worker$: ({recipeIds}) => forkJoin(recipeIds.map(id => loadRecipe$(id)))
})

describe('a recipe read by a configured task', () => {
    let gateway

    beforeAll(async () => {
        gateway = await startGateway()
        config = {
            sepalEndpoint: `http://127.0.0.1:${gateway.address().port}`,
            sepalApiKey: SEPAL_API_KEY
        }
    })

    afterAll(() => new Promise(resolve => gateway.close(resolve)))

    beforeEach(() => {
        requests.length = 0
        answer = () => ({status: 200, body: RECIPE})
    })

    test('is fetched from the configured gateway as the session the executor runs as', async () => {
        const execution = await startExecution()

        const [recipe] = await execution.read(['recipe-1'])

        expect(recipe).toEqual(RECIPE)
        expect(requests).toEqual([{
            url: '/api/processing-recipes/recipe-1',
            authorization: apiKeyAuth(SEPAL_API_KEY)
        }])
    })

    // Which recipes a user may read is Recipe's to decide; a refusal reaches the caller as the
    // failure Recipe answered with, not as a recipe.
    test('fails with the refusal Recipe answered, rather than returning anything', async () => {
        const execution = await startExecution()
        answer = () => ({status: 404, body: {message: 'Not found'}})

        const failure = await failureFor(execution, 'recipe-1')

        expect(failure.statusCode).toBe(404)
    })

    test('is fetched once however often the execution references it', async () => {
        const execution = await startExecution()

        const [first, second] = await execution.read(['recipe-1', 'recipe-1'])

        expect(first).toBe(second)
        expect(requests).toHaveLength(1)
    })

    test('is fetched again by the next execution', async () => {
        const first = await startExecution()
        await first.read(['recipe-1'])
        await first.end()

        const second = await startExecution()
        await second.read(['recipe-1'])

        expect(requests).toHaveLength(2)
    })

    test('is not fetched at all once the execution has ended', async () => {
        const execution = await startExecution()
        await execution.end()

        await expect(execution.read(['recipe-1'])).rejects.toThrow(/Operation ended/)
        expect(requests).toEqual([])
    })

    // The tasks of one execution, run the way the worker runs them: one state, shared by all of them.
    const startExecution = async () => {
        const state = {}
        const [configure] = configureJob(WORKER)
        const [reading] = readingJob(WORKER)
        await firstValueFrom(configure.worker$({state}).pipe(defaultIfEmpty(null)))
        return {
            read: recipeIds => firstValueFrom(reading.worker$({recipeIds, state})),
            end: () => firstValueFrom(
                (configure.finalize$ ?? (() => EMPTY))({state}).pipe(defaultIfEmpty(null))
            )
        }
    }

    const failureFor = async (execution, recipeId) => {
        try {
            await execution.read([recipeId])
            throw new Error(`Expected reading ${recipeId} to fail`)
        } catch (error) {
            return error
        }
    }
})

const RECIPE = {id: 'recipe-1', type: 'MOSAIC'}

// The gateway reads a key as Basic with an empty username; a username selects password
// authentication instead.
const apiKeyAuth = apiKey => `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`

const startGateway = () => new Promise(resolve => {
    const server = createServer((request, response) => {
        requests.push({url: request.url, authorization: request.headers.authorization})
        const {status, body} = answer()
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(body))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
})
