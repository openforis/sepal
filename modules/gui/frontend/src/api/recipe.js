import {delete$, get$, post$} from 'http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),

    save$: ({id, type, name, gzippedContents}) =>
        post$(`/api/processing-recipes/${id}`, {
            query: {type, name},
            body: gzippedContents,
            headers: {'Content-Type': 'application/octet-stream'}
            // headers: {'Content-Type': 'application/json; charset=utf-8'}
        }),

    delete$: recipeId =>
        delete$(`/api/processing-recipes/${recipeId}`),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
