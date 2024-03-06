import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import {EarthEngineTableTileProvider} from '../tileProvider/earthEngineTableTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {TileLayer} from './tileLayer'
import {finalize, tap} from 'rxjs'
import {isEqual} from 'hash'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

export class EarthEngineTableLayer extends TileLayer {
    constructor({
        map,
        layerIndex = 0,
        busy,
        mapId$,
        watchedProps,
        minZoom,
        maxZoom
    }) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.busy = busy
        this.mapId$ = mapId$
        this.watchedProps = watchedProps
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = urlTemplate => {
        const {busy} = this
        const tileProvider = new EarthEngineTableTileProvider({urlTemplate})
        return new BalancingTileProvider({
            tileProvider,
            busy,
            renderingEnabled$: this.map.renderingEnabled$,
            renderingStatus$: this.map.renderingStatus$
        })
    }

    createOverlay = tileProvider => {
        const {map, minZoom, maxZoom} = this
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({name: 'EarthEngineTableLayer', tileProvider, google, minZoom, maxZoom})
    }

    addToMap$ = () => {
        const id = `EarthEngineTableLayer-${uuid()}`
        this.busy.set(id, true)
        return this.mapId$.pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy.set(id, false))
        )
    }

    equals = other =>
        other === this
            || other instanceof EarthEngineTableLayer
                && isEqual(other.watchedProps, this.watchedProps)
}
