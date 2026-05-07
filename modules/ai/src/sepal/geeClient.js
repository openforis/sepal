const {firstValueFrom, map} = require('rxjs')
const {get$, postJson$} = require('#sepal/httpClient')
const log = require('#sepal/log').getLogger('tools')

const sepalUserHeader = username =>
    ({'sepal-user': JSON.stringify({username})})

const createGeeClient = ({geeEndpoint}) => {

    const getRecipeBands = async ({username, recipe}) => {
        const result = await firstValueFrom(
            postJson$(`${geeEndpoint}/bands`, {
                headers: sepalUserHeader(username),
                body: {recipe}
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        return result
    }

    const getRecipeGeometry = async ({username, recipe}) => {
        const result = await firstValueFrom(
            postJson$(`${geeEndpoint}/recipe/geometry`, {
                headers: sepalUserHeader(username),
                body: {recipe}
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        return result
    }

    const getRecipeBounds = async ({username, recipe}) => {
        const result = await firstValueFrom(
            postJson$(`${geeEndpoint}/recipe/bounds`, {
                headers: sepalUserHeader(username),
                body: {recipe}
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        return result
    }

    const searchDatasets = async ({username, query, allowedTypes}) => {
        const queryParams = {text: query}
        if (allowedTypes && allowedTypes.length) {
            queryParams.allowedTypes = allowedTypes
        }
        const result = await firstValueFrom(
            get$(`${geeEndpoint}/datasets`, {
                headers: sepalUserHeader(username),
                query: queryParams
            }).pipe(
                map(({body}) => JSON.parse(body))
            )
        )
        return result
    }

    return {
        getRecipeBands,
        getRecipeGeometry,
        getRecipeBounds,
        searchDatasets
    }
}

module.exports = {createGeeClient}
