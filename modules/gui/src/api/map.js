import {get$} from '~/http-client'

export default {
    loadApiKeys$: () =>
        get$('/api/data/map-api-keys')
}
