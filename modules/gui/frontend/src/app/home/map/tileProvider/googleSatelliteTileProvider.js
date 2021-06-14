import {TileProvider} from './tileProvider'
import {get$} from 'http-client'
import {map} from 'rxjs/operators'

export class GoogleSatelliteTileProvider extends TileProvider {
    constructor() {
        super()
        const subdomain = 'mt0'
        this.formatTileUrl = (x, y, z) => `https://${subdomain}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
    }

    getType() {
        return 'Google Satellite'
    }

    getConcurrency() {
        return 10
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
