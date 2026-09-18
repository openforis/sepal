import {delete$, get$, post$} from '~/http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes/folder'),

    save$: folder =>
        post$('/api/processing-recipes/folder', {
            body: folder
        }),

    remove$: folderId =>
        delete$(`/api/processing-recipes/folder/${folderId}`)
}
