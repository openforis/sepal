import {jest} from '@jest/globals'
import {createServer} from 'http'
import {defaultIfEmpty, firstValueFrom, of} from 'rxjs'

// What a task ends up reading a recipe with, from its own configuration operation through to the request
// the shared loader issues: over real HTTP, against a server standing in for the gateway. Reading through
// the adapter alone would say nothing about whether the configuration operation installs it.

const SEPAL_USERNAME = 'task-executor'
const SEPAL_PASSWORD = 'not-a-real-password'

const requests = []

let config

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
            sepalUsername: SEPAL_USERNAME,
            sepalPassword: SEPAL_PASSWORD
        }
    })

    afterAll(() => new Promise(resolve => gateway.close(resolve)))

    beforeEach(() => {
        requests.length = 0
    })

    test('is fetched from the configured gateway with the credentials the task was given', async () => {
        await runConfigureJob()

        const recipe = await firstValueFrom(loadRecipe$('recipe-1'))

        expect(recipe).toEqual(RECIPE)
        expect(requests).toEqual([{
            url: '/api/processing-recipes/recipe-1',
            authorization: basic(SEPAL_USERNAME, SEPAL_PASSWORD)
        }])
    })

    const runConfigureJob = async () => {
        const [{worker$}] = configureJob(WORKER)
        await firstValueFrom(worker$({}).pipe(defaultIfEmpty(null)))
    }
})

const RECIPE = {id: 'recipe-1', type: 'MOSAIC'}

const basic = (username, password) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

const startGateway = () => new Promise(resolve => {
    const server = createServer((request, response) => {
        requests.push({url: request.url, authorization: request.headers.authorization})
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(RECIPE))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
})
