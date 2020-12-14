import {of} from 'rxjs'

export default class GoogleSatelliteLayer {
    constructor({google, googleMap, layerIndex}) {
        this.google = google
        this.googleMap = googleMap
        this.layerIndex = layerIndex
        this.type = 'GoogleSatelliteLayer'
    }

    equals(o) {
        return this.type === o.type
    }

    addToMap() {
        const subdomain = 'mt0'
        const getTileUrl = ({x, y}, z) => `http://${subdomain}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
        const layer = new this.google.maps.ImageMapType({
            getTileUrl,
            name: 'googleSatellite',
            minZoom: 3,
            maxZoom: 17,
        })
        this.googleMap.overlayMapTypes.setAt(this.layerIndex, layer)
    }

    removeFromMap() {
        // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
        this.googleMap.overlayMapTypes.insertAt(this.layerIndex, null)
        this.googleMap.overlayMapTypes.removeAt(this.layerIndex + 1)
    }

    hide(hidden) {
        hidden ? this.removeFromMap() : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
