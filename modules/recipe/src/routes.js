import {gunzipSync} from 'zlib'

// Reserved to mean "no folder" on a move (see modules/gui/src/api/recipe.js): a path segment can
// carry neither null nor empty. Ids are client-generated UUIDs, so this cannot collide by accident,
// and POST /folder (below) refuses to save one under it outright, so the reservation holds even if
// a client ever sends this literally.
const NO_FOLDER_ID = 'none'

const createRoutes = ({recipeService, requireAuth}) => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // Folder routes first so `/folder` is not captured by `/:id`.
    .post('/folder/:id', requireAuth, async ctx => {
        ctx.body = await recipeService.moveRecipes({
            principal: principal(ctx),
            folderId: ctx.params.id === NO_FOLDER_ID ? null : ctx.params.id,
            recipeIds: ctx.request.body || []
        })
    })
    .delete('/folder/:id', requireAuth, async ctx => {
        respondToFolderRemove(ctx, await recipeService.removeFolder({
            principal: principal(ctx), folderId: ctx.params.id
        }))
    })
    .post('/folder', requireAuth, async ctx => {
        const {id, name, parentId, defaultAssetFolder, defaultWorkspaceFolder} = ctx.request.body || {}
        if (id === NO_FOLDER_ID) {
            ctx.status = 400
            ctx.body = {code: 'FOLDER_ID_RESERVED'}
        } else {
            respondToFolderSave(ctx, await recipeService.saveFolder({
                principal: principal(ctx),
                folder: {id, name, parentId: parentId || null, defaultAssetFolder, defaultWorkspaceFolder}
            }))
        }
    })
    .get('/folder', requireAuth, async ctx => {
        ctx.body = await recipeService.listFolders({principal: principal(ctx)})
    })
    .post('/:id', requireAuth, async ctx => {
        const expected = parseExpectedRevision(ctx.query.expectedRevision)
        if (expected.invalid) {
            ctx.status = 400
            ctx.body = {code: 'INVALID_EXPECTED_REVISION'}
        } else {
            const {folderId, type, name} = ctx.query
            respondToSave(ctx, await recipeService.saveRecipe({
                principal: principal(ctx),
                recipe: {
                    id: ctx.params.id,
                    // Query strings cannot carry null; an empty folder therefore maps to SQL NULL.
                    folderId: folderId || null,
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

const respondToFolderSave = (ctx, result) => {
    if (result.outcome === 'saved') {
        ctx.body = result.folders
    } else if (result.outcome === 'cycle') {
        ctx.status = 409
        ctx.body = {code: 'FOLDER_CYCLE'}
    } else if (result.outcome === 'parentNotFound') {
        ctx.status = 409
        ctx.body = {code: 'FOLDER_PARENT_NOT_FOUND'}
    } else {
        throw new Error(`Unrecognized folder save outcome: ${result.outcome}`)
    }
}

const respondToFolderRemove = (ctx, result) => {
    if (result.outcome === 'removed') {
        ctx.body = result.folders
    } else if (result.outcome === 'notEmpty') {
        ctx.status = 409
        ctx.body = {code: 'FOLDER_NOT_EMPTY', folders: result.folders, recipes: result.recipes}
    } else {
        throw new Error(`Unrecognized folder remove outcome: ${result.outcome}`)
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
