import {handleError$} from './earthEngineError'
import {WMTSTileProvider} from './wmtsTileProvider'

const TYPE = 'EarthEngine'
const CONCURRENCY = 8
// ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH (@google/earthengine)
export const TILE_SIZE = 256

export class EarthEngineProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: TYPE,
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: TILE_SIZE
        })
    }

    handleError$(error, retryError) {
        return handleError$(error, retryError)
    }
}
