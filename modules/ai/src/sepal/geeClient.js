const {map, defer} = require('rxjs')
const {get$, postJson$} = require('#sepal/httpClient')

const sepalUserHeader = username =>
    ({'sepal-user': JSON.stringify({username})})

const createGeeClient = ({geeEndpoint}) => {

    const getRecipeBands$ = ({username, recipe}) =>
        postJson$(`${geeEndpoint}/bands`, {
            headers: sepalUserHeader(username),
            body: {recipe}
        }).pipe(map(({body}) => JSON.parse(body)))

    const getRecipeGeometry$ = ({username, recipe}) =>
        postJson$(`${geeEndpoint}/recipe/geometry`, {
            headers: sepalUserHeader(username),
            body: {recipe}
        }).pipe(map(({body}) => JSON.parse(body)))

    const getRecipeBounds$ = ({username, recipe}) =>
        postJson$(`${geeEndpoint}/recipe/bounds`, {
            headers: sepalUserHeader(username),
            body: {recipe}
        }).pipe(map(({body}) => JSON.parse(body)))

    const searchDatasets$ = ({username, query, allowedTypes}) =>
        defer(() => {
            const queryParams = {text: query}
            if (allowedTypes && allowedTypes.length) {
                queryParams.allowedTypes = allowedTypes
            }
            return get$(`${geeEndpoint}/datasets`, {
                headers: sepalUserHeader(username),
                query: queryParams
            }).pipe(map(({body}) => JSON.parse(body)))
        })

    return {
        getRecipeBands$,
        getRecipeGeometry$,
        getRecipeBounds$,
        searchDatasets$
    }
}

module.exports = {createGeeClient}
