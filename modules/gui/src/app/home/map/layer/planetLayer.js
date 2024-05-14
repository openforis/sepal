import {GoogleMapsOverlay} from './googleMapsOverlay'
import {PlanetTileProvider} from '../tileProvider/planetTileProvider'
import {TileLayer} from './tileLayer'
import {of, tap} from 'rxjs'

export class PlanetLayer extends TileLayer {
    constructor({map, layerIndex = 0, urlTemplate, concurrency, minZoom, maxZoom}) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.urlTemplate = urlTemplate
        this.concurrency = concurrency
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = () => {
        const {urlTemplate, concurrency} = this
        return new PlanetTileProvider({urlTemplate, concurrency})
    }

    createOverlay = () => {
        const {map, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider()
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({name: 'PlanetLayer', tileProvider, google, minZoom, maxZoom})
    }

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    equals = other =>
        other === this
            || other instanceof PlanetLayer
                && other.urlTemplate === this.urlTemplate
                && other.concurrency === this.concurrency
}
