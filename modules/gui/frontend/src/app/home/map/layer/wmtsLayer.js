import {TileLayer} from '../tileLayer/tileLayer'
import {WMTSTileProvider} from '../tileProvider/wmtsTileProvider'
import Layer from './layer'

export default class WMTSLayer extends Layer {
    constructor({map, urlTemplate, concurrency, progress$}) {
        super()
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
