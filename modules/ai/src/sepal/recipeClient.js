const {map, defer} = require('rxjs')
const {get$, post$, postBinary$, postJson$, delete$} = require('#sepal/httpClient')
const {gzipSync} = require('zlib')
const {v4: uuid} = require('uuid')

const sepalUserHeader = username =>
    ({'sepal-user': JSON.stringify({username})})

const createRecipeClient = ({sepalEndpoint}) => {
    const baseUrl = `${sepalEndpoint}/api/processing-recipes`

    const listRecipes$ = ({username, type, projectId}) =>
        get$(baseUrl, {
            headers: sepalUserHeader(username)
        }).pipe(
            map(({body}) => JSON.parse(body)),
            map(recipes => {
                let result = recipes
                if (type) result = result.filter(r => r.type === type)
                if (projectId) result = result.filter(r => r.projectId === projectId)
                return result
            })
        )

    const loadRecipe$ = ({username, recipeId}) =>
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

    const saveRecipe$ = ({username, id, type, name, projectId, model}) =>
        defer(() => {
            const recipeId = id || uuid()
            const envelope = {
                id: recipeId,
                type,
                title: name,
                model,
                ui: {initialized: true},
                layers: []
            }
            if (projectId) envelope.projectId = projectId
            const gzipped = gzipSync(Buffer.from(JSON.stringify(envelope), 'utf-8'))
            const query = {type, name}
            if (projectId) query.projectId = projectId

            return postBinary$(`${baseUrl}/${recipeId}`, {
                headers: {
                    ...sepalUserHeader(username),
                    'Content-Type': 'application/octet-stream'
                },
                body: gzipped,
                query
            }).pipe(
                map(() => ({id: recipeId, type, name, projectId}))
            )
        })

    const deleteRecipes$ = ({username, recipeIds}) => {
        const request$ = recipeIds.length === 1
            ? delete$(`${baseUrl}/${recipeIds[0]}`, {
                headers: sepalUserHeader(username)
            })
            : delete$(baseUrl, {
                headers: {
                    ...sepalUserHeader(username),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(recipeIds)
            })
        return request$.pipe(map(() => ({deleted: recipeIds})))
    }

    const moveRecipes$ = ({username, recipeIds, projectId}) =>
        postJson$(`${baseUrl}/project/${projectId}`, {
            headers: sepalUserHeader(username),
            body: recipeIds
        }).pipe(map(() => ({moved: recipeIds, projectId})))

    const listProjects$ = ({username}) =>
        get$(`${baseUrl}/project`, {
            headers: sepalUserHeader(username)
        }).pipe(map(({body}) => JSON.parse(body)))

    const saveProject$ = ({username, id, name, defaultAssetFolder, defaultWorkspaceFolder}) =>
        defer(() => {
            const projectId = id || uuid()
            const project = {id: projectId, name}
            if (defaultAssetFolder) project.defaultAssetFolder = defaultAssetFolder
            if (defaultWorkspaceFolder) project.defaultWorkspaceFolder = defaultWorkspaceFolder
            return post$(`${baseUrl}/project`, {
                headers: sepalUserHeader(username),
                body: project
            }).pipe(map(() => project))
        })

    const deleteProject$ = ({username, projectId}) =>
        delete$(`${baseUrl}/project/${projectId}`, {
            headers: sepalUserHeader(username)
        }).pipe(map(() => ({deleted: projectId})))

    return {
        listRecipes$,
        loadRecipe$,
        saveRecipe$,
        deleteRecipes$,
        moveRecipes$,
        listProjects$,
        saveProject$,
        deleteProject$
    }
}

module.exports = {createRecipeClient}
