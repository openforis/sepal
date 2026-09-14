import {jest} from '@jest/globals'
import {createServer} from 'http'
import {defaultIfEmpty, firstValueFrom, of} from 'rxjs'

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
const {default: configureJob} = await import('#task/jobs/configure')

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
        await runConfigureJob()

        const recipe = await firstValueFrom(loadRecipe$('recipe-1'))

        expect(recipe).toEqual(RECIPE)
        expect(requests).toEqual([{
            url: '/api/processing-recipes/recipe-1',
            authorization: apiKeyAuth(SEPAL_API_KEY)
        }])
    })

    // Which recipes a user may read is Recipe's to decide; a refusal reaches the caller as the
    // failure Recipe answered with, not as a recipe.
    test('fails with the refusal Recipe answered, rather than returning anything', async () => {
        await runConfigureJob()
        answer = () => ({status: 404, body: {message: 'Not found'}})

        const failure = await failureFor('recipe-1')

        expect(failure.statusCode).toBe(404)
    })

    const runConfigureJob = async () => {
        const [{worker$}] = configureJob(WORKER)
        await firstValueFrom(worker$({}).pipe(defaultIfEmpty(null)))
    }

    const failureFor = async recipeId => {
        try {
            await firstValueFrom(loadRecipe$(recipeId))
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
