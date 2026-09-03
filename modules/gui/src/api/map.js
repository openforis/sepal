import {get$} from '~/http-client'

export default {
    loadApiKeys$: () =>
        get$('/api/scene-metadata/map-api-keys')
}
