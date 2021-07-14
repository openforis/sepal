import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export default class EarthEnginePreviewLayer extends EarthEngineLayer {
    constructor({previewRequest, ...args}) {
        super({
            mapId$: api.gee.preview$(previewRequest),
            watchedProps: previewRequest,
            ...args
        })
    }
}
