import {GoogleMapsOverlay} from './googleMapsOverlay'
import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import {Layer} from './layer'
import {of, tap} from 'rxjs'

export default class GoogleSatelliteLayer extends Layer {
    constructor({map, layerIndex = 0, busy$, minZoom, maxZoom}) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.busy$ = busy$
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = () =>
        new GoogleSatelliteTileProvider()

    createOverlay = () => {
        const {map, busy$, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider()
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({tileProvider, google, minZoom, maxZoom, busy$})
    }

    addToMap = () => {
        this.layer = this.createOverlay()
        const {map, layerIndex, layer} = this
        const {googleMap} = map.getGoogle()
        if (layer) {
            googleMap.overlayMapTypes.setAt(layerIndex, layer)
        }
    }

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    removeFromMap = () => {
        const {map, layerIndex, layer} = this
        const {googleMap} = map.getGoogle()
        if (layer) {
            googleMap.overlayMapTypes.removeAt(layerIndex)
            // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
            // googleMap.overlayMapTypes.insertAt(layerIndex, null)
            // googleMap.overlayMapTypes.removeAt(layerIndex + 1)
            layer.close()
        }
    }

    hide = hidden => {
        const {layer} = this
        if (layer) {
            layer.setOpacity(hidden ? 0 : 1)
        }
    }

    equals = other =>
        other === this
            || other instanceof GoogleSatelliteLayer
}
