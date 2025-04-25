import {get$} from '~/http-client'

export default {
    validateApiKey$: apiKey =>
        get$('https://api.planet.com/basemaps/v1/mosaics', {
            username: apiKey,
            crossDomain: true,
            query: {_page_size: 250},
            maxRetries: 0
        }),

    loadMosaics$: apiKey =>
        get$('https://api.planet.com/basemaps/v1/mosaics', {
            username: apiKey,
            crossDomain: true,
            query: {_page_size: 250}
        }),
}
