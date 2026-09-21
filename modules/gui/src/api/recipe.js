import {deleteJson$, get$, postBinary$, postJson$} from '~/http-client'

// The move destination is a URL path segment, which can carry neither null nor an empty string (an
// empty segment falls through to POST /project, i.e. saveProject). Ids are client-generated UUIDs,
// and the server refuses to save a project under this literal id outright, so it can never collide
// with a real one. routes.js translates it back to SQL NULL.
const NO_PROJECT = 'none'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),

    save$: ({id, projectId, type, name, gzippedContents, expectedRevision}) =>
        postBinary$(`/api/processing-recipes/${id}`, {
            query: {projectId, type, name, ...(expectedRevision == null ? {} : {expectedRevision})},
            body: gzippedContents
        }),

    remove$: recipeIds =>
        deleteJson$('/api/processing-recipes', {
            body: recipeIds
        }),

    move$: (recipeIds, projectId) =>
        postJson$(`/api/processing-recipes/project/${projectId || NO_PROJECT}`, {
            body: recipeIds
        }),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
