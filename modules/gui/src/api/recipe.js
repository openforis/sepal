import {deleteJson$, get$, postBinary$, postJson$} from '~/http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),

    save$: ({id, projectId, type, name, gzippedContents}) =>
        postBinary$(`/api/processing-recipes/${id}`, {
            query: {projectId, type, name},
            body: gzippedContents
        }),

    remove$: recipeIds =>
        deleteJson$('/api/processing-recipes', {
            body: recipeIds
        }),

    move$: (recipeIds, projectId) =>
        postJson$(`/api/processing-recipes/project/${projectId}`, {
            body: recipeIds
        }),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
