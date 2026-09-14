import {firstValueFrom} from 'rxjs'

import {configureNoLogging, getLogger} from '#sepal/log'
import {createRecipeReader} from '#sepal/recipe/recipeReader'

// Who a recipe read acts as, over real HTTP through this module's own routes, authentication and
// ownership policy, using the reader the gee module reads recipes with. Only persistence is
// substituted: which rows exist is not what this proves.

const server = await import('#sepal/httpServer')
const {createRequireAuth} = await import('./currentUser.js')
const {RecipeService} = await import('./recipeService.js')
const {createRoutes} = await import('./routes.js')

const OWNER = {username: 'alice', roles: []}
const OTHER = {username: 'bob', roles: []}
const ADMIN = {username: 'admin', roles: ['application_admin']}

describe('reading a recipe as a named user', () => {
    let running
    let recipeEndpoint
    let rows

    beforeAll(async () => {
        configureNoLogging()
        running = await startRecipe()
        recipeEndpoint = `http://127.0.0.1:${running.address().port}`
    })

    beforeEach(() => {
        rows = {'alices-recipe': {owner: 'alice', recipe: {id: 'alices-recipe', type: 'MOSAIC'}}}
    })

    afterAll(() => running && new Promise(resolve => running.close(resolve)))

    test('the owner reads their own recipe', async () => {
        const recipe = await read('alices-recipe', OWNER)

        expect(recipe).toEqual({id: 'alices-recipe', type: 'MOSAIC'})
    })

    // A recipe someone else owns is answered the same way one that does not exist is, which is what
    // keeps ownership undisclosed. The reader must not turn that into two outcomes either.
    test('a recipe owned by someone else is indistinguishable from one that does not exist', async () => {
        const foreign = await failureFor('alices-recipe', OTHER)
        const absent = await failureFor('no-such-recipe', OTHER)

        expect(foreign.statusCode).toBe(404)
        expect(absent.statusCode).toBe(foreign.statusCode)
    })

    test('an administrator still reads another user\'s recipe', async () => {
        const recipe = await read('alices-recipe', ADMIN)

        expect(recipe.id).toBe('alices-recipe')
    })

    // The acting user is the one the reader was composed with. A recipe whose own content names another
    // owner does not make the reader that owner.
    test('a recipe naming another owner does not make the reader that owner', async () => {
        rows['claims-bob'] = {
            owner: 'alice',
            recipe: {id: 'claims-bob', type: 'MOSAIC', owner: 'bob', username: 'bob'}
        }

        const failure = await failureFor('claims-bob', OTHER)

        expect(failure.statusCode).toBe(404)
    })

    describe('without an authenticated user', () => {
        test.each([
            ['no principal', undefined],
            ['an empty principal', {}],
            ['a principal with no username', {roles: ['application_admin']}]
        ])('%s reads nothing, and reaches no endpoint at all', async (_description, principal) => {
            const reader = createRecipeReader({recipeEndpoint: UNREACHABLE, principal})

            await expect(firstValueFrom(reader('alices-recipe'))).rejects.toThrow(/authenticated user/)
        })
    })

    const read = (recipeId, principal) =>
        firstValueFrom(createRecipeReader({recipeEndpoint, principal})(recipeId))

    const failureFor = async (recipeId, principal) => {
        try {
            await read(recipeId, principal)
            throw new Error(`Expected reading ${recipeId} as ${principal.username} to fail`)
        } catch (error) {
            return error
        }
    }

    const startRecipe = () => {
        const repository = {findRecipe: async recipeId => rows[recipeId] || null}
        return server.start({
            port: 0,
            routes: createRoutes({
                recipeService: new RecipeService(repository),
                requireAuth: createRequireAuth({log: getLogger('currentUser')})
            }),
            // The default collects process-wide Prometheus metrics, which this has nothing to say about.
            metricsMiddleware: (_ctx, next) => next()
        })
    }

    // Nothing listens here, so a request that was issued would fail as a connection error rather than
    // as the refusal being asserted.
    const UNREACHABLE = 'http://127.0.0.1:1'
})
