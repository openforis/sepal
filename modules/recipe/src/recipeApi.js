import {gunzipSync} from 'zlib'

import {currentVersionForType, projectRowToMap, recipeRowToListItem, withProjectId} from './recipe.js'
import * as repository from './recipeRepository.js'

const ADMIN_ROLE = 'application_admin'

const isAdmin = ctx => (ctx.state.currentUser.roles || []).includes(ADMIN_ROLE)

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

// POST /:id  (query: projectId, type, name; body: gzipped contents)
const saveRecipe = async ctx => {
    const username = ctx.state.currentUser.username
    const {projectId, type, name} = ctx.query
    const contents = await readGzippedBody(ctx)
    await repository.saveRecipe({
        id: ctx.params.id,
        projectId: projectId ?? null,
        name,
        type,
        username,
        contents,
        typeVersion: currentVersionForType(type)
    })
    ctx.body = await recipeList(username)
}

// GET /:id  -> raw recipe JSON (projectId injected); 404 if missing or not owner (unless admin)
const loadRecipe = async ctx => {
    const row = await repository.getById(ctx.params.id)
    if (!row) {
        ctx.status = 404
        return
    }
    if (row.username !== ctx.state.currentUser.username && !isAdmin(ctx)) {
        ctx.status = 404
        return
    }
    ctx.type = 'application/json'
    ctx.body = withProjectId(row.contents, row.project_id)
}

// GET /
const listRecipes = async ctx => {
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

export {
    listProjects, listRecipes, loadRecipe, moveRecipes, removeProject, removeRecipe, removeRecipes,
    saveProject, saveRecipe
}
