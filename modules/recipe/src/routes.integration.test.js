import assert from 'node:assert/strict'
import {after, before, beforeEach, describe, test} from 'node:test'
import {gzipSync} from 'node:zlib'

import * as httpServer from '#sepal/httpServer'

import {createRequireAuth} from './currentUser.js'
import {createRoutes, MAX_RECIPE_BYTES} from './routes.js'

let server
let baseUrl

const service = recipeServiceSpy()

before(async () => {
    server = await httpServer.start({
        port: 0,
        routes: createRoutes({
            recipeService: service,
            requireAuth: createRequireAuth({log: {warn: () => {}}})
        }),
        metricsMiddleware: async (_ctx, next) => await next()
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise(resolve => server.close(resolve)))

beforeEach(() => service.reset())

describe('authentication', () => {
    test('refuses a request without the sepal-user header', async () => {
        const response = await GET('/', {headers: {}})

        assert.equal(response.status, 401)
        assert.equal(service.reached, false)
    })

    test('passes the authenticated user to the service as the principal', async () => {
        await GET('/')

        assert.deepEqual(service.listRecipesCommand, {principal: authenticatedUser})
    })
})

describe('route precedence', () => {
    // `/project` must not be matched by `/:id` and read as a recipe called "project".
    test('reads projects rather than a recipe named project', async () => {
        const project = aProject()
        service.projects = [project]
        service.recipe = aRecipeContent()

        const response = await GET('/project')

        assert.deepEqual(service.listProjectsCommand, {principal: authenticatedUser})
        assert.equal(service.loadRecipeCommand, null)
        assert.deepEqual(response.body, [project])
    })
})

describe('POST /:id', () => {
    test('acknowledges the committed revision', async () => {
        service.saveOutcome = {outcome: 'saved', revision: 4}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, {revision: service.saveOutcome.revision})
    })

    test('gunzips the request body into the full save command', async () => {
        const content = aRecipeContent({model: {source: 'LANDSAT', bands: ['red', 'nir']}})

        await POST(`/${A_RECIPE_ID}?type=MOSAIC&name=A%20recipe`, {gzip: content})

        assert.deepEqual(service.saveRecipeCommand, {
            principal: authenticatedUser,
            recipe: {id: A_RECIPE_ID, projectId: null, name: 'A recipe', type: 'MOSAIC', content},
            expectedRevision: undefined
        })
    })

    test('reads the expected revision from the query as a number', async () => {
        await POST(`/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=4`, {gzip: aRecipeContent()})

        assert.equal(service.saveRecipeCommand.expectedRevision, 4)
    })

    // Query strings cannot carry null, and an empty value must not become the literal empty string.
    test('turns an empty project id into no project at all', async () => {
        await POST(`/${A_RECIPE_ID}?type=MOSAIC&projectId=`, {gzip: aRecipeContent()})

        assert.equal(service.saveRecipeCommand.recipe.projectId, null)
    })

    for (const expectedRevision of ['abc', '0', '1.5', '-1', '']) {
        test(`refuses ${expectedRevision} as an expected revision`, async () => {
            const response = await POST(
                `/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=${expectedRevision}`, {gzip: aRecipeContent()}
            )

            assert.equal(response.status, 400)
            assert.deepEqual(response.body, {code: 'INVALID_EXPECTED_REVISION'})
            assert.equal(service.reached, false)
        })
    }

    test('refuses an invalid expected revision before reading a body it could not decode', async () => {
        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=abc`,
            {gzip: undefined, raw: Buffer.from('not gzip')})

        assert.equal(response.status, 400)
        assert.equal(service.reached, false)
    })

    test('accepts a recipe of exactly the size limit', async () => {
        const content = aRecipeContentOfBytes(MAX_RECIPE_BYTES)

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: content})

        assert.equal(response.status, 200)
        assert.deepEqual(service.saveRecipeCommand.recipe.content, content)
    })

    test('refuses an upload larger than a recipe may be', async () => {
        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {raw: Buffer.alloc(MAX_RECIPE_BYTES + 1)})

        assert.equal(response.status, 413)
        assert.equal(service.reached, false)
    })

    test('refuses a small upload that decompresses beyond the size limit', async () => {
        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`,
            {gzip: aRecipeContentOfBytes(MAX_RECIPE_BYTES + 1)})

        assert.equal(response.status, 413)
        assert.equal(service.reached, false)
    })

    test('reports a conflict as 412, carrying the revision the client should reload', async () => {
        service.saveOutcome = {outcome: 'conflict', currentRevision: 9}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        assert.equal(response.status, 412)
        assert.deepEqual(response.body, {
            code: 'RECIPE_REVISION_CONFLICT', currentRevision: service.saveOutcome.currentRevision
        })
    })

    test('reports a type mismatch as 409', async () => {
        service.saveOutcome = {outcome: 'typeMismatch'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        assert.equal(response.status, 409)
        assert.deepEqual(response.body, {code: 'RECIPE_TYPE_MISMATCH'})
    })

    test('reports a missing recipe as 404', async () => {
        service.saveOutcome = {outcome: 'notFound'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        assert.equal(response.status, 404)
    })

    // A duck-typed port has no compiler to catch a renamed outcome, so an unknown one must surface as a
    // server fault rather than a plausible domain response.
    test('reports an unrecognized outcome as 500', async () => {
        service.saveOutcome = {outcome: 'somethingElse'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        assert.equal(response.status, 500)
    })
})

describe('GET /:id', () => {
    test('returns the recipe as JSON', async () => {
        service.recipe = aLoadedRecipe()

        const response = await GET(`/${A_RECIPE_ID}`)

        assert.deepEqual(
            service.loadRecipeCommand,
            {principal: authenticatedUser, recipeId: A_RECIPE_ID}
        )
        assert.deepEqual(response.body, service.recipe)
    })

    test('forbids caching the revision it carries', async () => {
        service.recipe = aLoadedRecipe()

        const response = await GET(`/${A_RECIPE_ID}`)

        assert.equal(response.headers.get('cache-control'), 'no-store')
    })

    test('reports an unknown recipe as 404', async () => {
        service.recipe = null

        const response = await GET(`/${A_RECIPE_ID}`)

        assert.equal(response.status, 404)
    })
})

describe('GET /', () => {
    test('returns the recipe summaries as JSON', async () => {
        service.recipes = [aRecipeSummary()]

        const response = await GET('/')

        assert.deepEqual(response.body, service.recipes)
    })

    test('forbids caching the revisions it carries', async () => {
        service.recipes = [aRecipeSummary()]

        const response = await GET('/')

        assert.equal(response.headers.get('cache-control'), 'no-store')
    })
})

describe('DELETE /:id', () => {
    test('removes the recipe named in the path and returns what remains', async () => {
        service.recipes = [aRecipeSummary({id: 'to-keep'})]

        const response = await DELETE(`/${A_RECIPE_ID}`)

        assert.deepEqual(service.removeRecipesCommand, {
            principal: authenticatedUser, recipeIds: [A_RECIPE_ID]
        })
        assert.deepEqual(response.body, service.recipes)
    })
})

describe('DELETE /', () => {
    test('removes every id in the JSON body and returns what remains', async () => {
        const removed = ['first-to-remove', 'second-to-remove']
        service.recipes = [aRecipeSummary({id: 'to-keep'})]

        const response = await DELETE('/', {json: removed})

        assert.deepEqual(service.removeRecipesCommand, {
            principal: authenticatedUser, recipeIds: removed
        })
        assert.deepEqual(response.body, service.recipes)
    })
})

describe('POST /project/:id', () => {
    test('moves the recipes in the JSON body to the project named in the path', async () => {
        const moved = [A_RECIPE_ID]
        service.recipes = [aRecipeSummary({projectId: DESTINATION_PROJECT_ID})]

        const response = await POST(`/project/${DESTINATION_PROJECT_ID}`, {json: moved})

        assert.deepEqual(service.moveRecipesCommand, {
            principal: authenticatedUser, projectId: DESTINATION_PROJECT_ID, recipeIds: moved
        })
        assert.deepEqual(response.body, service.recipes)
    })
})

describe('POST /project', () => {
    test('saves the project in the JSON body and returns the projects', async () => {
        const project = aProject()
        service.projects = [project]

        const response = await POST('/project', {json: project})

        assert.deepEqual(service.saveProjectCommand, {principal: authenticatedUser, project})
        assert.deepEqual(response.body, service.projects)
    })
})

describe('DELETE /project/:id', () => {
    test('removes the project named in the path and returns what remains', async () => {
        service.projects = [aProject({id: 'to-keep'})]

        const response = await DELETE(`/project/${A_PROJECT_ID}`)

        assert.deepEqual(service.removeProjectCommand, {
            principal: authenticatedUser, projectId: A_PROJECT_ID
        })
        assert.deepEqual(response.body, service.projects)
    })
})

const GET = (path, options) => send('GET', path, options)
const POST = (path, options) => send('POST', path, options)
const DELETE = (path, options) => send('DELETE', path, options)

const send = async (method, path, {json, gzip, raw, headers = authenticatedHeaders} = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {...headers, ...contentTypeFor({json, gzip, raw})},
        body: bodyFor({json, gzip, raw})
    })
    return {status: response.status, headers: response.headers, body: await decode(response)}
}

const contentTypeFor = ({json, gzip, raw}) => {
    if (json !== undefined) {
        return {'content-type': 'application/json'}
    } else if (gzip !== undefined || raw !== undefined) {
        return {'content-type': 'application/octet-stream'}
    } else {
        return {}
    }
}

const bodyFor = ({json, gzip, raw}) => {
    if (json !== undefined) {
        return JSON.stringify(json)
    } else if (gzip !== undefined) {
        return gzipSync(Buffer.from(JSON.stringify(gzip)))
    } else {
        return raw
    }
}

const decode = async response => {
    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch (_error) {
        return text
    }
}

// Each operation records the command it received, so a test cannot pass when the adapter reaches for a
// different one.
function recipeServiceSpy() {
    const spy = {
        loadRecipeCommand: null,
        listRecipesCommand: null,
        saveRecipeCommand: null,
        removeRecipesCommand: null,
        moveRecipesCommand: null,
        listProjectsCommand: null,
        saveProjectCommand: null,
        removeProjectCommand: null,
        reached: false,

        recipe: null,
        recipes: [],
        projects: [],
        saveOutcome: {outcome: 'saved', revision: 1},

        reset: () => {
            spy.loadRecipeCommand = null
            spy.listRecipesCommand = null
            spy.saveRecipeCommand = null
            spy.removeRecipesCommand = null
            spy.moveRecipesCommand = null
            spy.listProjectsCommand = null
            spy.saveProjectCommand = null
            spy.removeProjectCommand = null
            spy.reached = false
            spy.recipe = null
            spy.recipes = []
            spy.projects = []
            spy.saveOutcome = {outcome: 'saved', revision: 1}
        },

        loadRecipe: async command => {
            spy.loadRecipeCommand = command
            spy.reached = true
            return spy.recipe
        },
        listRecipes: async command => {
            spy.listRecipesCommand = command
            spy.reached = true
            return spy.recipes
        },
        saveRecipe: async command => {
            spy.saveRecipeCommand = command
            spy.reached = true
            return spy.saveOutcome
        },
        removeRecipes: async command => {
            spy.removeRecipesCommand = command
            spy.reached = true
            return spy.recipes
        },
        moveRecipes: async command => {
            spy.moveRecipesCommand = command
            spy.reached = true
            return spy.recipes
        },
        listProjects: async command => {
            spy.listProjectsCommand = command
            spy.reached = true
            return spy.projects
        },
        saveProject: async command => {
            spy.saveProjectCommand = command
            spy.reached = true
            return spy.projects
        },
        removeProject: async command => {
            spy.removeProjectCommand = command
            spy.reached = true
            return spy.projects
        }
    }
    return spy
}

const aRecipeContent = (over = {}) => ({model: {source: 'LANDSAT'}, ...over})

// A document whose JSON encoding is exactly `bytes` long.
const aRecipeContentOfBytes = bytes => {
    const unpadded = JSON.stringify(aRecipeContent({padding: ''})).length
    return aRecipeContent({padding: 'x'.repeat(bytes - unpadded)})
}

// What a load returns: the stored document with the columns the repository injects.
const aLoadedRecipe = (over = {}) => ({
    ...aRecipeContent(), projectId: A_PROJECT_ID, revision: 4, ...over
})

const aRecipeSummary = (over = {}) => ({
    id: A_RECIPE_ID, projectId: null, name: 'A recipe', type: 'MOSAIC', revision: 1, ...over
})

const aProject = (over = {}) => ({
    id: A_PROJECT_ID, name: 'A project',
    defaultAssetFolder: null, defaultWorkspaceFolder: null, ...over
})

const A_RECIPE_ID = 'a-recipe'
const A_PROJECT_ID = 'a-project'
const DESTINATION_PROJECT_ID = 'destination-project'

const authenticatedUser = {username: 'bob', roles: []}
const authenticatedHeaders = {'sepal-user': JSON.stringify(authenticatedUser)}
