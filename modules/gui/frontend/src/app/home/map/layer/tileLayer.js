import {GoogleMapsLayer} from '../tileLayer/googleMapsLayer'
import {of} from 'rxjs'
import Layer from './layer'

export default class TileLayer extends Layer {
    constructor({map, layerIndex = 0, progress$, minZoom, maxZoom}) {
        super({map, layerIndex, progress$})
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.layer = null
    }

    equals(_o) {
        throw new Error('Subclass needs to implement equals')
    }

    createTileProvider() {
        throw new Error('Subclass needs to implement createTileProvider')
    }

    createLayer() {
        const {map, progress$, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider()
        const {google} = map.getGoogle()
        this.layer = new GoogleMapsLayer(tileProvider, {google, minZoom, maxZoom}, progress$)
    }

    addToMap() {
        this.layer || this.createLayer()
        const {map, layerIndex, layer} = this
        if (layer) {
            map.addToMap(layerIndex, layer)
        }
    }

    removeFromMap() {
        const {map, layerIndex, layer} = this
        if (layer) {
            map.removeFromMap(layerIndex)
            layer.close()
        }
    }

    hide(hidden) {
        const {layer} = this
        if (layer) {
            layer.setOpacity(hidden ? 0 : 1)
        }
    }

    initialize$() {
        return of(this)
    }
}
