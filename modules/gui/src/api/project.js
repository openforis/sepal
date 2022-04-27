import {delete$, get$, post$} from 'http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes/project'),

    save$: ({id, name}) =>
        post$('/api/processing-recipes/project', {
            body: {id, name}
        }),

    remove$: projectId =>
        delete$(`/api/processing-recipes/project/${projectId}`)
}
