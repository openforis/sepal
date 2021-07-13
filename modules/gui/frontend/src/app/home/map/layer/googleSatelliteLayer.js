import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import {TileLayer} from './googleMapsLayer'
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

    initialize$() {
        return of(this)
    }
}
