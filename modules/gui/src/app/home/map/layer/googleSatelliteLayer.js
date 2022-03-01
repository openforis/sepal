import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import TileLayer from './tileLayer'

export default class GoogleSatelliteLayer extends TileLayer {
    constructor({map, busy$}) {
        super({map, busy$})
    }

    equals(o) {
        return o === this || o instanceof GoogleSatelliteLayer
    }

    createTileProvider() {
        return new GoogleSatelliteTileProvider()
    }
}
