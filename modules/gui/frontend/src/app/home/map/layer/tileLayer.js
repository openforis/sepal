import {GoogleTileLayer} from '../tileLayer/googleTileLayer'
import {of} from 'rxjs'
import Layer from './layer'

export default class TileLayer extends Layer {
    constructor({map, layerIndex = 0, progress$}) {
        super({map, layerIndex, progress$})
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
        this.tileLayer = new GoogleTileLayer({map, tileProvider, layerIndex, progress$})
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
