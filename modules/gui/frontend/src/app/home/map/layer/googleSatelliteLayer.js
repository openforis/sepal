import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import Layer from './layer'

export default class GoogleSatelliteLayer extends Layer {
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
