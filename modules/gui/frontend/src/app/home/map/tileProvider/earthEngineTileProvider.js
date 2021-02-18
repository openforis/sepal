import {TileProvider} from './tileProvider'
import {get$} from 'http-client'
import {map} from 'rxjs/operators'
import ee from '@google/earthengine'

export class EarthEngineTileProvider extends TileProvider {
    constructor({mapId, token, urlTemplate}) {
        super()
        this.mapId = mapId
        this.token = token
        this.formatTileUrl = (x, y, z) => {
            const width = Math.pow(2, z)
            x = x % width
            if (x < 0) {
                x += width
            }
            return urlTemplate
                .replace('{x}', x)
                .replace('{y}', y)
                .replace('{z}', z)
        }
        this.tileSize = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
    }

    getType() {
        return 'EarthEngine'
    }

    getConcurrency() {
        return 4
    }

    loadTile$({x, y, zoom}) {
        const url = this.formatTileUrl(x, y, zoom)
        return get$(url, {
            retries: 0,
            responseType: 'blob',
            mode: 'no-cors'
        }).pipe(
            map(e => e.response)
        )
    }
}
