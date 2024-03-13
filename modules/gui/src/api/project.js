import {delete$, get$, post$} from '~/http-client'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes/project'),

    save$: project =>
        post$('/api/processing-recipes/project', {
            body: project
        }),

    remove$: projectId =>
        delete$(`/api/processing-recipes/project/${projectId}`)
}
