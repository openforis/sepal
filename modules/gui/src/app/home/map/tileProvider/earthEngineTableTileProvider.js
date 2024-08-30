import {handleError$} from './earthEngineError'
import {WMTSTileProvider} from './wmtsTileProvider'

// ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH (@google/earthengine)
const TILE_SIZE = 256
const CONCURRENCY = 8

export class EarthEngineTableTileProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: TILE_SIZE
        })
    }

    handleError$(error, retryError) {
        return handleError$(error, retryError)
    }
}
