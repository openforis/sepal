import {WMTSTileProvider} from './wmtsTileProvider'
import ee from '@google/earthengine'

const CONCURRENCY = 16

export class EarthEngineTableTileProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
        })
    }
}
