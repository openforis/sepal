import {get$} from '~/http-client'

export default {
    validateApiKey$: apiKey =>
        get$('https://api.planet.com/basemaps/v1/mosaics', {
            username: apiKey,
            crossDomain: true
        }),

    loadMosaics$: apiKey =>
        get$('https://api.planet.com/basemaps/v1/mosaics', {
            username: apiKey,
            crossDomain: true
        }),
    
    // loadAll$: () => get$('/api/apps/list'),

    // requestSession$: endpoint => post$('/api/sandbox/start', {
    //     query: {endpoint: endpoint ? endpoint : 'shiny'}
    // }),

    // waitForSession$: endpoint => get$('/api/sandbox/start', {
    //     query: {endpoint: endpoint ? endpoint : 'shiny'}
    // })
}
