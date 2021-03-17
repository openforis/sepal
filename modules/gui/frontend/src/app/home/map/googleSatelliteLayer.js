import {of} from 'rxjs'

export default class GoogleSatelliteLayer {
    constructor({sepalMap, layerIndex}) {
        this.sepalMap = sepalMap
        this.layerIndex = layerIndex
        this.type = 'GoogleSatelliteLayer'
    }

    equals(o) {
        return this.type === o.type
    }

    addToMap() {
        const {google} = this.sepalMap.getGoogle()
        const subdomain = 'mt0'
        const getTileUrl = ({x, y}, z) => `http://${subdomain}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
        const layer = new google.maps.ImageMapType({
            getTileUrl,
            name: 'googleSatellite',
            minZoom: 3,
            maxZoom: 17,
        })
        this.sepalMap.addToMap(this.layerIndex, layer)
    }

    removeFromMap() {
        this.sepalMap.removeFromMap(this.layerIndex)
    }

    hide(hidden) {
        hidden ? this.removeFromMap() : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
