import {GoogleMapsLayer} from './googleMapsLayer'

export class GoogleTileLayer {
    constructor({
        layerIndex,
        tileProvider,
        map,
        minZoom = 0,
        maxZoom = 20,
        progress$
    }) {
        const {google} = map.getGoogle()
        this.map = map
        this.layerIndex = layerIndex
        this.mapLayer = new GoogleMapsLayer(tileProvider, {google, minZoom, maxZoom}, progress$)
    }

    add() {
        const {map, layerIndex, mapLayer} = this
        map.addToMap(layerIndex, mapLayer)
    }

    remove() {
        const {map, layerIndex, mapLayer} = this
        map.removeFromMap(layerIndex)
        mapLayer.close()
    }

    hide(hidden) {
        const {mapLayer} = this
        mapLayer.setOpacity(hidden ? 0 : 1)
    }
}
