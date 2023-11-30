import {GoogleMapsOverlay} from './googleMapsOverlay'
import {PlanetTileProvider} from '../tileProvider/planetTileProvider'
import {ReplaySubject, of, tap} from 'rxjs'
import {TileLayer} from './tileLayer'

export default class PlanetLayer extends TileLayer {
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
