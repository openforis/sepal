import {GoogleSatelliteTileProvider} from './tileProvider/googleSatelliteTileProvider'
import {TileLayer} from './googleMaps/googleMapsLayer'
import {of} from 'rxjs'

export default class GoogleSatelliteLayer {
    constructor({map, progress$}) {
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
        this.layer = TileLayer({map, tileProvider, layerIndex, progress$})
        this.layer.add()
    }

    removeFromMap() {
        this.map.removeFromMap(this.layerIndex)
    }

    hide(hidden) {
        hidden ? this.removeFromMap() : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
