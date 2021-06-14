import {TileProvider} from './tileProvider'
import {get$} from 'http-client'
import {map} from 'rxjs/operators'

export class WMTSTileProvider extends TileProvider {
    constructor({type, urlTemplate, tileSize, concurrency}) {
        super()
        this.type = type
        this.concurrency = concurrency
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
        this.tileSize = tileSize
    }

    getType() {
        return this.type
    }

    getConcurrency() {
        return this.concurrency
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
