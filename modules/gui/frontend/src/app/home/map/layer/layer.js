import {TileLayer} from '../tileLayer/tileLayer'
import {of} from 'rxjs'

export default class Layer {
    constructor({map, layerIndex = 0, progress$}) {
        this.map = map
        this.layerIndex = layerIndex
        this.progress$ = progress$
        this.tileLayer = null
    }

    equals(_o) {
        throw new Error('Subclass needs to implement equals')
    }

    createTileProvider() {
        throw new Error('Subclass needs to implement createTileProvider')
    }

    addToMap() {
        const {map, layerIndex, progress$} = this
        const tileProvider = this.createTileProvider()
        this.tileLayer = new TileLayer({map, tileProvider, layerIndex, progress$})
        this.tileLayer.add()
    }

    removeFromMap() {
        this.tileLayer && this.tileLayer.remove()
    }

    hide(hidden) {
        this.tileLayer && this.tileLayer.hide(hidden)
    }

    initialize$() {
        return of(this)
    }
}
