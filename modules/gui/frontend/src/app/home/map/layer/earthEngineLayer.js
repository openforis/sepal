import {catchError, of, tap, throwError} from 'rxjs'
import TileLayer from './tileLayer'
import _ from 'lodash'

export default class EarthEngineLayer extends TileLayer {
    constructor({
        map,
        busy$,
        layerIndex,
        mapId$,
        watchedProps
    }) {
        super({map, busy$, layerIndex})
        this.mapId$ = mapId$
        this.watchedProps = watchedProps
        this.token = null
        this.mapId = null
        this.urlTemplate = null
    }

    equals(o) {
        return _.isEqual(o && o.watchedProps, this.watchedProps)
    }

    createTileProvider() {
        throw new Error('Subclass should implement createTileProvider')
    }

    initialize$() {
        this.busy$ && this.busy$.next(true)
        return this.token
            ? of(true)
            : this.mapId$.pipe(
                tap(({token, mapId, urlTemplate}) => {
                    this.token = token
                    this.mapId = mapId
                    this.urlTemplate = urlTemplate
                }),
                catchError(error => {
                    this.busy$ && this.busy$.next(false)
                    return throwError(() => error)
                })
            )
    }
}
