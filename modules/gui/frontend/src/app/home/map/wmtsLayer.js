import {of} from 'rxjs'

export default class WMTSLayer {
    constructor({sepalMap, layerIndex, urlTemplate}) {
        this.sepalMap = sepalMap
        this.layerIndex = layerIndex
        this.urlTemplate = urlTemplate
    }

    equals(o) {
        return this.urlTemplate === o.urlTemplate
    }

    addToMap() {
        const {google} = this.sepalMap.getGoogle()
        const getTileUrl = ({x, y}, z) => this.urlTemplate
            .replace('{x}', x)
            .replace('{y}', y)
            .replace('{z}', z)
        const layer = new google.maps.ImageMapType({
            getTileUrl,
            name: 'googleSatellite',
            minZoom: 3,
            maxZoom: 17
        })
        this.sepalMap.addToMap(this.layerIndex, layer)
    }

    removeFromMap() {
        this.sepalMap.removeFromMap(this.layerIndex)
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
