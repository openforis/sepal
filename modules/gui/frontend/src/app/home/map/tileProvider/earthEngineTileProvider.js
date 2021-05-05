import {WMTSTileProvider} from './wmtsTileProvider'
import ee from '@google/earthengine'

const CONCURRENCY = 4

export class EarthEngineTileProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
        })
    }
}
