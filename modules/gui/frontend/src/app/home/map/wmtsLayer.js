import {TileLayer} from './googleMaps/googleMapsLayer'
import {WMTSTileProvider} from './tileProvider/wmtsTileProvider'
import {of} from 'rxjs'

export default class WMTSLayer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        this.map = map
        this.layerIndex = 0
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
        this.progress$ = progress$
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }

    addToMap() {
        const {map, layerIndex, urlTemplate, concurrency, progress$} = this
        const tileProvider = new WMTSTileProvider({type: 'Planet', urlTemplate, concurrency})
        this.layer = TileLayer({map, tileProvider, layerIndex, progress$})
        this.layer.add()
    }

    removeFromMap() {
        this.map.removeFromMap(this.layerIndex)
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
