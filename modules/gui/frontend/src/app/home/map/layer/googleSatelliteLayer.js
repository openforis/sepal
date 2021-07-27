import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import TileLayer from './tileLayer'

export default class GoogleSatelliteLayer extends TileLayer {
    constructor({map, progress$}) {
        super({map, progress$})
        this.type = 'GoogleSatelliteLayer'
    }

    equals(o) {
        return this.type === o.type
    }

    createTileProvider() {
        return new GoogleSatelliteTileProvider()
    }
}
