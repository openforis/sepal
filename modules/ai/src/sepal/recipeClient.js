const {firstValueFrom} = require('rxjs')
const {map} = require('rxjs')
const {get$, post$, postBinary$, postJson$, delete$} = require('#sepal/httpClient')
const {gzipSync} = require('zlib')
const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('tools')

const sepalUserHeader = username =>
    ({'sepal-user': JSON.stringify({username})})

const createRecipeClient = ({sepalEndpoint}) => {
    const baseUrl = `${sepalEndpoint}/api/processing-recipes`

    const listRecipes = async ({username, type, projectId}) => {
        const result = await firstValueFrom(
            get$(baseUrl, {
                headers: sepalUserHeader(username)
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        let recipes = result
        if (type) {
            recipes = recipes.filter(r => r.type === type)
        }
        if (projectId) {
            recipes = recipes.filter(r => r.projectId === projectId)
        }
        return recipes
    }

    const loadRecipe = async ({username, recipeId}) => {
        const result = await firstValueFrom(
            get$(`${baseUrl}/${recipeId}`, {
                headers: sepalUserHeader(username)
            }).pipe(
                map(({body}) => {
                    const recipe = JSON.parse(body)
                    // Strip UI-only state, return only meaningful configuration
                    const {ui: _ui, layers: _layers, ...rest} = recipe
                    return rest
                })
            )
        )
        return result
    }

    const saveRecipe = async ({username, id, type, name, projectId, model}) => {
        const recipeId = id || uuid()
        const envelope = {
            id: recipeId,
            type,
            title: name,
            model,
            ui: {initialized: true},
            layers: []
        }
        if (projectId) {
            envelope.projectId = projectId
        }
        const contents = JSON.stringify(envelope)
        const gzipped = gzipSync(Buffer.from(contents, 'utf-8'))

        const query = {type, name}
        if (projectId) {
            query.projectId = projectId
        }

        await firstValueFrom(
            postBinary$(`${baseUrl}/${recipeId}`, {
                headers: {
                    ...sepalUserHeader(username),
                    'Content-Type': 'application/octet-stream'
                },
                body: gzipped,
                query
            })
        )

        return {id: recipeId, type, name, projectId}
    }

    const deleteRecipes = async ({username, recipeIds}) => {
        if (recipeIds.length === 1) {
            await firstValueFrom(
                delete$(`${baseUrl}/${recipeIds[0]}`, {
                    headers: sepalUserHeader(username)
                })
            )
        } else {
            await firstValueFrom(
                delete$(baseUrl, {
                    headers: {
                        ...sepalUserHeader(username),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(recipeIds)
                })
            )
        }
        return {deleted: recipeIds}
    }

    const moveRecipes = async ({username, recipeIds, projectId}) => {
        await firstValueFrom(
            postJson$(`${baseUrl}/project/${projectId}`, {
                headers: sepalUserHeader(username),
                body: recipeIds
            })
        )
        return {moved: recipeIds, projectId}
    }

    const listProjects = async ({username}) => {
        const result = await firstValueFrom(
            get$(`${baseUrl}/project`, {
                headers: sepalUserHeader(username)
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        return result
    }

    const saveProject = async ({username, id, name, defaultAssetFolder, defaultWorkspaceFolder}) => {
        const projectId = id || uuid()
        const project = {id: projectId, name}
        if (defaultAssetFolder) project.defaultAssetFolder = defaultAssetFolder
        if (defaultWorkspaceFolder) project.defaultWorkspaceFolder = defaultWorkspaceFolder

        await firstValueFrom(
            post$(`${baseUrl}/project`, {
                headers: sepalUserHeader(username),
                body: project
            })
        )
        return project
    }

    const deleteProject = async ({username, projectId}) => {
        await firstValueFrom(
            delete$(`${baseUrl}/project/${projectId}`, {
                headers: sepalUserHeader(username)
            })
        )
        return {deleted: projectId}
    }

    return {
        listRecipes,
        loadRecipe,
        saveRecipe,
        deleteRecipes,
        moveRecipes,
        listProjects,
        saveProject,
        deleteProject
    }
}

module.exports = {createRecipeClient}
