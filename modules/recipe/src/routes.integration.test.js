import {gzipSync} from 'zlib'

import * as httpServer from '#sepal/httpServer'

import {createRequireAuth} from './currentUser.js'
import {createRoutes} from './routes.js'

let server
let baseUrl

const service = recipeServiceSpy()

beforeAll(async () => {
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

afterAll(() => new Promise(resolve => server.close(resolve)))

beforeEach(() => service.reset())

describe('authentication', () => {
    test('refuses a request without the sepal-user header', async () => {
        const response = await GET('/', {headers: {}})

        expect(response.status).toBe(401)
        expect(service.reached).toBe(false)
    })

    test('passes the authenticated user to the service as the principal', async () => {
        await GET('/')

        expect(service.listRecipesCommand).toEqual({principal: authenticatedUser})
    })
})

describe('route precedence', () => {
    // `/project` must not be matched by `/:id` and read as a recipe called "project".
    test('reads projects rather than a recipe named project', async () => {
        const project = aProject()
        service.projects = [project]
        service.recipe = aRecipeContent()

        const response = await GET('/project')

        expect(service.listProjectsCommand).toEqual({principal: authenticatedUser})
        expect(service.loadRecipeCommand).toBeNull()
        expect(response.body).toEqual([project])
    })
})

describe('POST /:id', () => {
    test('acknowledges the committed revision', async () => {
        service.saveOutcome = {outcome: 'saved', revision: 4}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        expect(response.status).toBe(200)
        expect(response.body).toEqual({revision: service.saveOutcome.revision})
    })

    test('gunzips the request body into the full save command', async () => {
        const content = aRecipeContent({model: {source: 'LANDSAT', bands: ['red', 'nir']}})

        await POST(`/${A_RECIPE_ID}?type=MOSAIC&name=A%20recipe`, {gzip: content})

        expect(service.saveRecipeCommand).toEqual({
            principal: authenticatedUser,
            recipe: {id: A_RECIPE_ID, projectId: null, name: 'A recipe', type: 'MOSAIC', content},
            expectedRevision: undefined
        })
    })

    test('reads the expected revision from the query as a number', async () => {
        await POST(`/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=4`, {gzip: aRecipeContent()})

        expect(service.saveRecipeCommand.expectedRevision).toBe(4)
    })

    // Query strings cannot carry null, and an empty value must not become the literal empty string.
    test('turns an empty project id into no project at all', async () => {
        await POST(`/${A_RECIPE_ID}?type=MOSAIC&projectId=`, {gzip: aRecipeContent()})

        expect(service.saveRecipeCommand.recipe.projectId).toBeNull()
    })

    test.each(['abc', '0', '1.5', '-1', ''])('refuses %p as an expected revision', async expectedRevision => {
        const response = await POST(
            `/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=${expectedRevision}`, {gzip: aRecipeContent()}
        )

        expect(response.status).toBe(400)
        expect(response.body).toEqual({code: 'INVALID_EXPECTED_REVISION'})
        expect(service.reached).toBe(false)
    })

    test('refuses an invalid expected revision before reading a body it could not decode', async () => {
        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC&expectedRevision=abc`,
            {gzip: undefined, raw: Buffer.from('not gzip')})

        expect(response.status).toBe(400)
        expect(service.reached).toBe(false)
    })

    test('reports a conflict as 412, carrying the revision the client should reload', async () => {
        service.saveOutcome = {outcome: 'conflict', currentRevision: 9}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        expect(response.status).toBe(412)
        expect(response.body).toEqual({
            code: 'RECIPE_REVISION_CONFLICT', currentRevision: service.saveOutcome.currentRevision
        })
    })

    test('reports a type mismatch as 409', async () => {
        service.saveOutcome = {outcome: 'typeMismatch'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        expect(response.status).toBe(409)
        expect(response.body).toEqual({code: 'RECIPE_TYPE_MISMATCH'})
    })

    test('reports a missing recipe as 404', async () => {
        service.saveOutcome = {outcome: 'notFound'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        expect(response.status).toBe(404)
    })

    // A duck-typed port has no compiler to catch a renamed outcome, so an unknown one must surface as a
    // server fault rather than a plausible domain response.
    test('reports an unrecognized outcome as 500', async () => {
        service.saveOutcome = {outcome: 'somethingElse'}

        const response = await POST(`/${A_RECIPE_ID}?type=MOSAIC`, {gzip: aRecipeContent()})

        expect(response.status).toBe(500)
    })
})

describe('GET /:id', () => {
    test('returns the recipe as JSON', async () => {
        service.recipe = aLoadedRecipe()

        const response = await GET(`/${A_RECIPE_ID}`)

        expect(service.loadRecipeCommand).toEqual({principal: authenticatedUser, recipeId: A_RECIPE_ID})
        expect(response.body).toEqual(service.recipe)
    })

    test('forbids caching the revision it carries', async () => {
        service.recipe = aLoadedRecipe()

        const response = await GET(`/${A_RECIPE_ID}`)

        expect(response.headers.get('cache-control')).toBe('no-store')
    })

    test('reports an unknown recipe as 404', async () => {
        service.recipe = null

        const response = await GET(`/${A_RECIPE_ID}`)

        expect(response.status).toBe(404)
    })
})

describe('GET /', () => {
    test('returns the recipe summaries as JSON', async () => {
        service.recipes = [aRecipeSummary()]

        const response = await GET('/')

        expect(response.body).toEqual(service.recipes)
    })

    test('forbids caching the revisions it carries', async () => {
        service.recipes = [aRecipeSummary()]

        const response = await GET('/')

        expect(response.headers.get('cache-control')).toBe('no-store')
    })
})

describe('DELETE /:id', () => {
    test('removes the recipe named in the path and returns what remains', async () => {
        service.recipes = [aRecipeSummary({id: 'to-keep'})]

        const response = await DELETE(`/${A_RECIPE_ID}`)

        expect(service.removeRecipesCommand).toEqual({
            principal: authenticatedUser, recipeIds: [A_RECIPE_ID]
        })
        expect(response.body).toEqual(service.recipes)
    })
})

describe('DELETE /', () => {
    test('removes every id in the JSON body and returns what remains', async () => {
        const removed = ['first-to-remove', 'second-to-remove']
        service.recipes = [aRecipeSummary({id: 'to-keep'})]

        const response = await DELETE('/', {json: removed})

        expect(service.removeRecipesCommand).toEqual({
            principal: authenticatedUser, recipeIds: removed
        })
        expect(response.body).toEqual(service.recipes)
    })
})

describe('POST /project/:id', () => {
    test('moves the recipes in the JSON body to the project named in the path', async () => {
        const moved = [A_RECIPE_ID]
        service.recipes = [aRecipeSummary({projectId: DESTINATION_PROJECT_ID})]

        const response = await POST(`/project/${DESTINATION_PROJECT_ID}`, {json: moved})

        expect(service.moveRecipesCommand).toEqual({
            principal: authenticatedUser, projectId: DESTINATION_PROJECT_ID, recipeIds: moved
        })
        expect(response.body).toEqual(service.recipes)
    })

    test('moves to the reserved root id, translating it to no project at all', async () => {
        const moved = [A_RECIPE_ID]

        await POST('/project/none', {json: moved})

        expect(service.moveRecipesCommand).toEqual({
            principal: authenticatedUser, projectId: null, recipeIds: moved
        })
    })
})

describe('POST /project', () => {
    test('saves the project in the JSON body and returns the projects', async () => {
        const project = aProject()
        service.projects = [project]

        const response = await POST('/project', {json: project})

        expect(service.saveProjectCommand).toEqual({principal: authenticatedUser, project})
        expect(response.body).toEqual(service.projects)
    })

    test('passes the parent through, turning an empty parent into no parent at all', async () => {
        const project = aProject({parentId: ''})

        await POST('/project', {json: project})

        expect(service.saveProjectCommand.project.parentId).toBeNull()
    })

    test('refuses to save a project under the reserved root id', async () => {
        const project = aProject({id: 'none'})

        const response = await POST('/project', {json: project})

        expect(response.status).toBe(400)
        expect(response.body).toEqual({code: 'PROJECT_ID_RESERVED'})
        expect(service.reached).toBe(false)
    })

    test.each([
        {outcome: 'cycle', code: 'PROJECT_CYCLE'},
        {outcome: 'parentNotFound', code: 'PROJECT_PARENT_NOT_FOUND'}
    ])('answers 409 $code when the service reports $outcome', async ({outcome, code}) => {
        service.saveProjectOutcome = {outcome}

        const response = await POST('/project', {json: aProject()})

        expect(response.status).toBe(409)
        expect(response.body).toEqual({code})
    })
})

describe('DELETE /project/:id', () => {
    test('removes the project named in the path and returns what remains', async () => {
        service.projects = [aProject({id: 'to-keep'})]

        const response = await DELETE(`/project/${A_PROJECT_ID}`)

        expect(service.removeProjectCommand).toEqual({
            principal: authenticatedUser, projectId: A_PROJECT_ID
        })
        expect(response.body).toEqual(service.projects)
    })

    test('answers 409 with the counts when the project still holds something', async () => {
        service.removeProjectOutcome = {outcome: 'notEmpty', folders: 2, recipes: 5}

        const response = await DELETE(`/project/${A_PROJECT_ID}`)

        expect(response.status).toBe(409)
        expect(response.body).toEqual({code: 'PROJECT_NOT_EMPTY', folders: 2, recipes: 5})
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
        saveProjectOutcome: {outcome: 'saved', projects: []},
        removeProjectOutcome: {outcome: 'removed'},

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
            spy.saveProjectOutcome = {outcome: 'saved', projects: []}
            spy.removeProjectOutcome = {outcome: 'removed'}
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
            return spy.saveProjectOutcome.outcome === 'saved'
                ? {outcome: 'saved', projects: spy.projects}
                : spy.saveProjectOutcome
        },
        removeProject: async command => {
            spy.removeProjectCommand = command
            spy.reached = true
            return spy.removeProjectOutcome.outcome === 'removed'
                ? {outcome: 'removed', projects: spy.projects}
                : spy.removeProjectOutcome
        }
    }
    return spy
}

const aRecipeContent = (over = {}) => ({model: {source: 'LANDSAT'}, ...over})

// What a load returns: the stored document with the columns the repository injects.
const aLoadedRecipe = (over = {}) => ({
    ...aRecipeContent(), projectId: A_PROJECT_ID, revision: 4, ...over
})

const aRecipeSummary = (over = {}) => ({
    id: A_RECIPE_ID, projectId: null, name: 'A recipe', type: 'MOSAIC', revision: 1, ...over
})

const aProject = (over = {}) => ({
    id: A_PROJECT_ID, name: 'A project', parentId: null,
    defaultAssetFolder: null, defaultWorkspaceFolder: null, ...over
})

const A_RECIPE_ID = 'a-recipe'
const A_PROJECT_ID = 'a-project'
const DESTINATION_PROJECT_ID = 'destination-project'

const authenticatedUser = {username: 'bob', roles: []}
const authenticatedHeaders = {'sepal-user': JSON.stringify(authenticatedUser)}
