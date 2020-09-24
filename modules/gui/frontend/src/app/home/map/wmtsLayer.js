import {of} from 'rxjs'
import {google} from 'app/home/map/map'

export default class WMTSLayer {
    constructor({layerIndex, urlTemplate}) {
        this.layerIndex = layerIndex
        this.urlTemplate = urlTemplate
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }

    addToMap(googleMap) {
        const getTileUrl = ({x, y}, z) => this.urlTemplate
            .replace('{x}', x)
            .replace('{y}', y)
            .replace('{z}', z)
        const layer = new google.maps.ImageMapType({
            getTileUrl: getTileUrl,
            name: "googleSatellite",
            minZoom: 3,
            maxZoom: 17
        })
        googleMap.overlayMapTypes.setAt(this.layerIndex, layer)
    }

    removeFromMap(googleMap) {
        // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
        googleMap.overlayMapTypes.insertAt(this.layerIndex, null)
        googleMap.overlayMapTypes.removeAt(this.layerIndex + 1)
    }

    hide(googleMap, hidden) {
        hidden ? this.removeFromMap(googleMap) : this.addToMap(googleMap)
    }

    initialize$() {
        return of(this)
    }
}
