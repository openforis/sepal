import {GoogleMapsOverlay} from './googleMapsOverlay'
import {GoogleSatelliteTileProvider} from '../tileProvider/googleSatelliteTileProvider'
import {TileLayer} from './tileLayer'
import {of, tap} from 'rxjs'

export class GoogleSatelliteLayer extends TileLayer {
    constructor({map, layerIndex = 0, minZoom, maxZoom}) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = () =>
        new GoogleSatelliteTileProvider()

    createOverlay = () => {
        const {map, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider()
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({name: 'GoogleSatelliteLayer', tileProvider, google, minZoom, maxZoom})
    }

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    equals = other =>
        other === this
            || other instanceof GoogleSatelliteLayer
}
