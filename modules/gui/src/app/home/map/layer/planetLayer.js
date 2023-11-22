import {GoogleMapsOverlay} from './googleMapsOverlay'
import {Layer} from './layer'
import {PlanetTileProvider} from '../tileProvider/planetTileProvider'
import {ReplaySubject, of, tap} from 'rxjs'

export default class PlanetLayer extends Layer {
    constructor({map, layerIndex = 0, busy$, urlTemplate, concurrency, minZoom, maxZoom}) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.busy$ = busy$
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.cancel$ = new ReplaySubject()
    }

    createTileProvider = () => {
        const {urlTemplate, concurrency} = this
        return new PlanetTileProvider({urlTemplate, concurrency})
    }

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
            || other instanceof PlanetLayer
                && other.urlTemplate === this.urlTemplate
                && other.concurrency === this.concurrency
}
