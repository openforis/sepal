import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import TileLayer from './tileLayer'

export default class GoogleSatelliteLayer extends TileLayer {
    constructor({map, progress$}) {
        super({map, progress$})
    }

    equals(o) {
        return o === this || o instanceof GoogleSatelliteLayer
    }

    createTileProvider() {
        return new GoogleSatelliteTileProvider()
    }
}
