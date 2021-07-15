import {TileProvider} from './tileProvider'
import api from 'api'

export class WMTSTileProvider extends TileProvider {
    constructor({type, urlTemplate, tileSize, concurrency}) {
        super()
        this.type = type
        this.urlTemplate = urlTemplate
        this.tileSize = tileSize
        this.concurrency = concurrency
    }

    getType() {
        return this.type
    }

    getConcurrency() {
        return this.concurrency
    }

    loadTile$({x, y, zoom}) {
        const urlTemplate = this.urlTemplate
        return api.wmts.loadTile$({urlTemplate, x, y, zoom})
    }
}
