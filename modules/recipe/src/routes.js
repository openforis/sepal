import {gunzipSync} from 'zlib'

const createRoutes = ({recipeService, requireAuth}) => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // Project routes first so `/project` is not captured by `/:id`.
    .post('/project/:id', requireAuth, async ctx => {
        ctx.body = await recipeService.moveRecipes({
            principal: principal(ctx),
            projectId: ctx.params.id,
            recipeIds: ctx.request.body || []
        })
    })
    .delete('/project/:id', requireAuth, async ctx => {
        ctx.body = await recipeService.removeProject({
            principal: principal(ctx), projectId: ctx.params.id
        })
    })
    .post('/project', requireAuth, async ctx => {
        const {id, name, defaultAssetFolder, defaultWorkspaceFolder} = ctx.request.body || {}
        ctx.body = await recipeService.saveProject({
            principal: principal(ctx),
            project: {id, name, defaultAssetFolder, defaultWorkspaceFolder}
        })
    })
    .get('/project', requireAuth, async ctx => {
        ctx.body = await recipeService.listProjects({principal: principal(ctx)})
    })
    .post('/:id', requireAuth, async ctx => {
        const expected = parseExpectedRevision(ctx.query.expectedRevision)
        if (expected.invalid) {
            ctx.status = 400
            ctx.body = {code: 'INVALID_EXPECTED_REVISION'}
        } else {
            const {projectId, type, name} = ctx.query
            respondToSave(ctx, await recipeService.saveRecipe({
                principal: principal(ctx),
                recipe: {
                    id: ctx.params.id,
                    // Query strings cannot carry null; an empty project therefore maps to SQL NULL.
                    projectId: projectId || null,
                    name,
                    type,
                    content: await gzippedJsonBody(ctx)
                },
                expectedRevision: expected.revision
            }))
        }
    })
    .delete('/:id', requireAuth, async ctx => {
        ctx.body = await recipeService.removeRecipes({
            principal: principal(ctx), recipeIds: [ctx.params.id]
        })
    })
    .get('/:id', requireAuth, async ctx => {
        const recipe = await recipeService.loadRecipe({
            principal: principal(ctx), recipeId: ctx.params.id
        })
        if (recipe) {
            noStore(ctx)
            ctx.body = recipe
        } else {
            ctx.status = 404
        }
    })
    .get('/', requireAuth, async ctx => {
        noStore(ctx)
        ctx.body = await recipeService.listRecipes({principal: principal(ctx)})
    })
    .delete('/', requireAuth, async ctx => {
        ctx.body = await recipeService.removeRecipes({
            principal: principal(ctx), recipeIds: ctx.request.body || []
        })
    })

const respondToSave = (ctx, result) => {
    if (result.outcome === 'saved') {
        ctx.body = {revision: result.revision}
    } else if (result.outcome === 'conflict') {
        ctx.status = 412
        ctx.body = {code: 'RECIPE_REVISION_CONFLICT', currentRevision: result.currentRevision}
    } else if (result.outcome === 'typeMismatch') {
        ctx.status = 409
        ctx.body = {code: 'RECIPE_TYPE_MISMATCH'}
    } else if (result.outcome === 'notFound') {
        ctx.status = 404
    } else {
        throw new Error(`Unrecognized save outcome: ${result.outcome}`)
    }
}

const principal = ctx => ctx.state.currentUser

// Absence means create, so a malformed value must be rejected here rather than reaching the service as
// an absent precondition.
const parseExpectedRevision = value => {
    if (value === undefined) {
        return {}
    } else {
        const revision = Number(value)
        return Number.isSafeInteger(revision) && revision > 0 ? {revision} : {invalid: true}
    }
}

// Read the raw request stream (the GUI posts application/octet-stream, which koa-bodyparser leaves
// untouched) and gunzip it to the recipe document.
const gzippedJsonBody = ctx => new Promise((resolve, reject) => {
    const chunks = []
    ctx.req.on('data', chunk => chunks.push(chunk))
    ctx.req.on('end', () => {
        try {
            resolve(JSON.parse(gunzipSync(Buffer.concat(chunks)).toString('utf8')))
        } catch (error) {
            reject(error)
        }
    })
    ctx.req.on('error', reject)
})

const noStore = ctx => ctx.set('Cache-Control', 'no-store')

export {createRoutes}
