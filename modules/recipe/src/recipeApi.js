import {gunzipSync} from 'zlib'

import {currentVersionForType, projectRowToMap, recipeRowToListItem, rowToRecipe} from './recipe.js'
import * as repository from './recipeRepository.js'

const ADMIN_ROLE = 'application_admin'

// POST /:id  (query: projectId, type, name, expectedRevision for an update; body: gzipped contents)
const saveRecipe = async ctx => {
    const username = ctx.state.currentUser.username
    const {projectId, type, name} = ctx.query
    const expected = parseExpectedRevision(ctx.query.expectedRevision)
    if (expected.invalid) {
        ctx.status = 400
        ctx.body = {code: 'INVALID_EXPECTED_REVISION'}
        return
    }
    const contents = await readGzippedBody(ctx)
    const result = await repository.saveRecipe({
        id: ctx.params.id,
        // Query strings cannot carry null; an empty project therefore maps to SQL NULL.
        projectId: projectId || null,
        name,
        type,
        username,
        contents,
        typeVersion: currentVersionForType(type),
        expectedRevision: expected.revision
    })
    if (result.error === 'NOT_FOUND') {
        ctx.status = 404
    } else if (result.error === 'TYPE_MISMATCH') {
        ctx.status = 409
        ctx.body = {code: 'RECIPE_TYPE_MISMATCH'}
    } else if (result.error === 'CONFLICT') {
        ctx.status = 412
        ctx.body = {code: 'RECIPE_REVISION_CONFLICT', currentRevision: result.currentRevision}
    } else {
        ctx.body = {revision: result.revision}
    }
}

// GET /:id  -> the flat recipe; 404 if missing or not owner (unless admin)
const loadRecipe = async ctx => {
    const row = await ownedRow(ctx)
    if (row) {
        noStore(ctx)
        ctx.body = rowToRecipe(row)
    } else {
        ctx.status = 404
    }
}

// GET /
const listRecipes = async ctx => {
    noStore(ctx)
    ctx.body = await recipeList(ctx.state.currentUser.username)
}

// DELETE /:id
const removeRecipe = async ctx => {
    const username = ctx.state.currentUser.username
    await repository.removeRecipes([ctx.params.id], username)
    ctx.body = await recipeList(username)
}

// DELETE /  (body: id array)
const removeRecipes = async ctx => {
    const username = ctx.state.currentUser.username
    await repository.removeRecipes(ctx.request.body || [], username)
    ctx.body = await recipeList(username)
}

// POST /project  (form body)
const saveProject = async ctx => {
    const username = ctx.state.currentUser.username
    const {id, name, defaultAssetFolder, defaultWorkspaceFolder} = ctx.request.body || {}
    await repository.saveProject({id, name, username, defaultAssetFolder, defaultWorkspaceFolder})
    ctx.body = await projectList(username)
}

// GET /project
const listProjects = async ctx => {
    ctx.body = await projectList(ctx.state.currentUser.username)
}

// DELETE /project/:id
const removeProject = async ctx => {
    const username = ctx.state.currentUser.username
    await repository.removeProject(ctx.params.id, username)
    ctx.body = await projectList(username)
}

// POST /project/:id  (body: recipe id array)
const moveRecipes = async ctx => {
    const username = ctx.state.currentUser.username
    await repository.moveRecipes(ctx.params.id, ctx.request.body || [], username)
    ctx.body = await recipeList(username)
}

const ownedRow = async ctx => {
    const row = await repository.getById(ctx.params.id)
    return row && (row.username === ctx.state.currentUser.username || isAdmin(ctx)) ? row : null
}

const recipeList = async username =>
    (await repository.listRecipes(username)).map(recipeRowToListItem)

const projectList = async username =>
    (await repository.listProjects(username)).map(projectRowToMap)

// Read the raw request stream (the GUI posts application/octet-stream, which koa-bodyparser leaves
// untouched) and gunzip it to the recipe JSON string.
const readGzippedBody = ctx => new Promise((resolve, reject) => {
    const chunks = []
    ctx.req.on('data', chunk => chunks.push(chunk))
    ctx.req.on('end', () => {
        try {
            resolve(gunzipSync(Buffer.concat(chunks)).toString('utf8'))
        } catch (error) {
            reject(error)
        }
    })
    ctx.req.on('error', reject)
})

// Absence means create; malformed values must not be interpreted as an absent precondition.
const parseExpectedRevision = value => {
    if (value === undefined) {
        return {}
    } else {
        const revision = Number(value)
        return Number.isSafeInteger(revision) && revision > 0 ? {revision} : {invalid: true}
    }
}

const noStore = ctx => ctx.set('Cache-Control', 'no-store')

const isAdmin = ctx => (ctx.state.currentUser.roles || []).includes(ADMIN_ROLE)

export {
    listProjects, listRecipes, loadRecipe, moveRecipes, removeProject, removeRecipe, removeRecipes,
    saveProject, saveRecipe
}
