import {jest} from '@jest/globals'
import {defaultIfEmpty, EMPTY, firstValueFrom, of} from 'rxjs'

// Who this module reads recipes as. The identity is followed from the request the job boundary maps into
// worker arguments through to the recipe request the shared loader ends up issuing, so nothing between
// the two can substitute a different user.
//
// What this establishes is per-job replacement, not isolation between operations: the reader is global to
// a worker, so whether an operation can ever read as a later job's user is a property of the worker
// lifecycle rather than of anything here.

const RECIPE_ENDPOINT = 'http://recipe'

const requests = []
const submitted = []

jest.unstable_mockModule('#sepal/httpClient', () => ({
    get$: (url, options) => {
        requests.push({url, sepalUser: options?.headers?.['sepal-user']})
        return of({body: {id: 'loaded'}})
    }
}))

// The module's own configuration parses process arguments at import, which under a test runner are the
// runner's. Nothing here reads it.
jest.unstable_mockModule('#gee/config', () => ({
    googleProjectId: 'test-project',
    instances: 1,
    port: 80,
    recipeEndpoint: RECIPE_ENDPOINT,
    sepalEndpoint: 'http://test',
    serviceAccountCredentials: {}
}))

jest.unstable_mockModule('#gee/jobs/service/context', () => ({
    contextService: {serviceName: 'ContextService', serviceHandler$: () => of({})},
    getContext$: () => of({recipeEndpoint: RECIPE_ENDPOINT})
}))

// The worker threads a submitted job would run on are not what this is about; the arguments the job
// boundary builds for them are, so they are captured here and run directly instead.
jest.unstable_mockModule('#sepal/worker/scheduler', () => ({
    getScheduler: () => ({
        submit$: request => {
            submitted.push(request)
            return EMPTY
        }
    }),
    initScheduler: () => {}
}))

const {WORKER} = await import('#sepal/worker/factory')
const {loadRecipe$} = await import('#sepal/ee/recipe')
const {withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: configureJob} = await import('#gee/jobs/configure')

const ALICE = {username: 'alice', roles: []}
const BOB = {username: 'bob', roles: ['application_admin']}

beforeEach(() => {
    requests.length = 0
    submitted.length = 0
})

describe('the user a recipe is read as', () => {
    it('is the authenticated user of the request the job was built from', async () => {
        const operation = await runJobFor(requestOf(ALICE))

        const recipe = await operation.read$('some-recipe')

        expect(recipe).toEqual({id: 'loaded'})
        expect(actingUsers()).toEqual([ALICE])
    })

    it('is read from the Recipe module itself, not through the gateway', async () => {
        const operation = await runJobFor(requestOf(ALICE))

        await operation.read$('some-recipe')

        expect(requests.map(({url}) => url)).toEqual([`${RECIPE_ENDPOINT}/some-recipe`])
    })

    // The roles the gateway established travel with the user, so an administrator keeps the access
    // they already had and nobody else inherits it.
    it('carries the roles that user was authenticated with', async () => {
        const operation = await runJobFor(requestOf(BOB))

        await operation.read$('some-recipe')

        expect(actingUsers()).toEqual([BOB])
    })

    // The trusted header is the only source. Request parameters are the caller's to choose, and a caller
    // choosing who it acts as is what this exists to prevent.
    it('is the one the request header names, not one its body asks for', async () => {
        const operation = await runJobFor(requestOf(ALICE, {credentials: {sepalUser: BOB}, sepalUser: BOB}))

        await operation.read$('some-recipe')

        expect(actingUsers()).toEqual([ALICE])
    })

    it('does not survive into the next user\'s job', async () => {
        const alices = await runJobFor(requestOf(ALICE))
        await alices.read$('some-recipe')

        const bobs = await runJobFor(requestOf(BOB))
        await bobs.read$('some-recipe')

        expect(actingUsers()).toEqual([ALICE, BOB])
    })

    describe('when the request carried no authenticated user', () => {
        it('issues no recipe request at all', async () => {
            const operation = await runJobFor(requestOf(undefined))

            await expect(operation.read$('some-recipe')).rejects.toThrow(/authenticated user/)
            expect(requests).toEqual([])
        })

        // The previous user's authority must not be what an unauthenticated job falls back to.
        it('does not keep reading as the previous user', async () => {
            await runJobFor(requestOf(ALICE))
            const operation = await runJobFor(requestOf(undefined))

            await expect(operation.read$('some-recipe')).rejects.toThrow(/authenticated user/)
            expect(requests).toEqual([])
        })
    })
})

const actingUsers = () => requests.map(({sepalUser}) => JSON.parse(sepalUser))

// A request as the HTTP server hands it to a job.
const requestOf = (sepalUser, body = {}) => ({
    username: sepalUser?.username,
    requestId: 'request-1',
    requestTag: '<request-1>',
    request: {
        headers: sepalUser ? {'sepal-user': JSON.stringify(sepalUser)} : {},
        query: {},
        body
    }
})

// The configure task, run with the arguments the job boundary maps the request to and the request's
// own state - which is where it leaves the operation every later task of that request reads through.
const runJobFor = async request => {
    const state = {}
    const [{worker$}] = configureJob(WORKER)
    await firstValueFrom(worker$({...workerArgsOf(request), state}).pipe(defaultIfEmpty(null)))
    return {
        read$: id => withRecipeScope(state.recipeScope, () => firstValueFrom(loadRecipe$(id)))
    }
}

const workerArgsOf = request => {
    configureJob(request)
    const [args] = submitted.at(-1).args
    return args
}
