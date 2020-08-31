import {of} from 'rxjs'
import {google} from 'app/home/map/map'

export default class GoogleSatelliteLayer {
    constructor(layerIndex) {
        this.layerIndex = layerIndex
    }

    equals() {
        return true
    }

    addToMap(googleMap) {
        const subdomain = 'mt0'
        const getTileUrl = ({x, y}, z) => `http://${subdomain}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
        const layer = new google.maps.ImageMapType({
            getTileUrl: getTileUrl,
            name: "googleSatellite",
            minZoom: 3,
            maxZoom: 17,
        });
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
