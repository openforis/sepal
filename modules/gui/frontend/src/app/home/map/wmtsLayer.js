import {of} from 'rxjs'

export default class WMTSLayer {
    constructor({google, googleMap, layerIndex, urlTemplate}) {
        this.google = google
        this.googleMap = googleMap
        this.layerIndex = layerIndex
        this.urlTemplate = urlTemplate
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }

    addToMap() {
        const getTileUrl = ({x, y}, z) => this.urlTemplate
            .replace('{x}', x)
            .replace('{y}', y)
            .replace('{z}', z)
        const layer = new this.google.maps.ImageMapType({
            getTileUrl,
            name: 'googleSatellite',
            minZoom: 3,
            maxZoom: 17
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
