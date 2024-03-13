import {get$, post$} from '~/http-client'

export default {
    loadAll$: () => get$('/api/apps/list'),

    requestSession$: endpoint => post$('/api/sandbox/start', {
        query: {endpoint: endpoint ? endpoint : 'shiny'}
    }),

    waitForSession$: endpoint => get$('/api/sandbox/start', {
        query: {endpoint: endpoint ? endpoint : 'shiny'}
    })
}
