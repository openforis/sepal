import {get$} from '~/http-client'

export default {
    loadApiKeys$: () =>
        get$('/api/scene/map-api-keys')
}
