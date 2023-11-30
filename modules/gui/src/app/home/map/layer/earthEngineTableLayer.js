import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {TileLayer} from './tileLayer'
import {finalize, tap} from 'rxjs'
import {isEqual} from 'hash'
import _ from 'lodash'

export default class EarthEngineTableLayer extends TileLayer {
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

    createTileProvider = urlTemplate => {
        const {busy$} = this
        const tileProvider = new EarthEngineTableTileProvider({urlTemplate})
        return new BalancingTileProvider({tileProvider, retries: 3, busy$})
    }

    createOverlay = tileProvider => {
        const {map, busy$, minZoom, maxZoom} = this
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({tileProvider, google, minZoom, maxZoom, busy$})
    }

    addToMap$ = () => {
        this.busy$?.next(true)
        return this.mapId$.pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy$?.next(false))
        )
    }

    equals = other =>
        other === this
            || other instanceof EarthEngineTableLayer
                && isEqual(other.watchedProps, this.watchedProps)
}
