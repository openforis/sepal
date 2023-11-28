import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {Layer} from './layer'
import {finalize, tap} from 'rxjs'
import {isEqual} from 'hash'
import _ from 'lodash'

export default class EarthEngineTableLayer extends Layer {
    constructor({
        map,
        layerIndex = 0,
        busy$,
        mapId$,
        watchedProps,
        minZoom,
        maxZoom
    }) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.busy$ = busy$
        this.mapId$ = mapId$
        this.watchedProps = watchedProps
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = urlTemplate =>
        new EarthEngineTableTileProvider({urlTemplate})

    createOverlay = urlTemplate => {
        const {map, busy$, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider(urlTemplate)
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({tileProvider, google, minZoom, maxZoom, busy$})
    }

    addToMap = urlTemplate => {
        this.layer = this.createOverlay(urlTemplate)
        const {map, layerIndex, layer} = this
        const {googleMap} = map.getGoogle()
        if (layer) {
            googleMap.overlayMapTypes.setAt(layerIndex, layer)
        }
    }

    addToMap$ = () => {
        this.busy$?.next(true)
        return this.getMapId$().pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy$?.next(false))
        )
    }

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
            || other instanceof EarthEngineTableLayer
                && isEqual(other.watchedProps, this.watchedProps)
}
