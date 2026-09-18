import {deleteJson$, get$, postBinary$, postJson$} from '~/http-client'

// The move destination is a URL path segment, which can carry neither null nor an empty string (an
// empty segment falls through to POST /folder, i.e. saveFolder). Ids are client-generated UUIDs,
// and the server refuses to save a folder under this literal id outright, so it can never collide
// with a real one. routes.js translates it back to SQL NULL.
const NO_FOLDER = 'none'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),

    save$: ({id, folderId, type, name, gzippedContents, expectedRevision}) =>
        postBinary$(`/api/processing-recipes/${id}`, {
            query: {folderId, type, name, ...(expectedRevision == null ? {} : {expectedRevision})},
            body: gzippedContents
        }),

    remove$: recipeIds =>
        deleteJson$('/api/processing-recipes', {
            body: recipeIds
        }),

    move$: (recipeIds, folderId) =>
        postJson$(`/api/processing-recipes/folder/${folderId || NO_FOLDER}`, {
            body: recipeIds
        }),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
