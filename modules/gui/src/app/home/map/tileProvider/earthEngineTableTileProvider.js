import ee from '@google/earthengine'

import {handleError$} from './earthEngineError'
import {WMTSTileProvider} from './wmtsTileProvider'

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
