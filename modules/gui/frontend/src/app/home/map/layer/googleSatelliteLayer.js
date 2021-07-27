import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import {TileLayer} from '../tileLayer/tileLayer'
import Layer from './layer'

export default class GoogleSatelliteLayer extends Layer {
    constructor({map, progress$}) {
        super()
        this.map = map
        this.layerIndex = 0
        this.type = 'GoogleSatelliteLayer'
        this.progress$ = progress$
    }

    equals(o) {
        return this.type === o.type
    }

    addToMap() {
        const {map, layerIndex, progress$} = this
        const tileProvider = new GoogleSatelliteTileProvider()
        this.tileLayer = new TileLayer({map, tileProvider, layerIndex, progress$})
        this.tileLayer.add()
    }

    removeFromMap() {
        this.tileLayer && this.tileLayer.remove()
    }

    hide(hidden) {
        // hidden ? this.removeFromMap() : this.addToMap()
        this.tileLayer && this.tileLayer.hide(hidden)
    }
}
