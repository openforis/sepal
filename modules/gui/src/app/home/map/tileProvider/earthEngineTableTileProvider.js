import {WMTSTileProvider} from './wmtsTileProvider'
import {handleError$} from './earthEngineError'
import ee from '@google/earthengine'

const CONCURRENCY = 8

export class EarthEngineTableTileProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
        })
    }

    handleError$(error, retryError) {
        return handleError$(error, retryError)
    }
}
