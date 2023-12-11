import {GoogleMapsOverlay} from './googleMapsOverlay'
import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import {TileLayer} from './tileLayer'
import {of, tap} from 'rxjs'

export default class GoogleSatelliteLayer extends TileLayer {
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

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    equals = other =>
        other === this
            || other instanceof GoogleSatelliteLayer
}
