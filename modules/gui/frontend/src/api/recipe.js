import {delete$, get$, postBinary$} from 'http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),

    save$: ({id, type, name, gzippedContents}) =>
        postBinary$(`/api/processing-recipes/${id}`, {
            query: {type, name},
            body: gzippedContents
        }),

    delete$: recipeId =>
        delete$(`/api/processing-recipes/${recipeId}`),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
