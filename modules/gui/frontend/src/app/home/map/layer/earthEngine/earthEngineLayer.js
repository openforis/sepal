import {ReplaySubject, of, throwError} from 'rxjs'
import {catchError, mapTo, takeUntil, tap} from 'rxjs/operators'
import TileLayer from '../tileLayer'
import _ from 'lodash'

export default class EarthEngineLayer extends TileLayer {
    constructor({
        map,
        progress$,
        layerIndex,
        mapId$,
        watchedProps,
        onInitialize,
        onInitialized,
        onError
    }) {
        super({map, progress$, layerIndex})
        this.mapId$ = mapId$
        this.watchedProps = watchedProps
        this.onInitialize = onInitialize
        this.onInitialized = onInitialized
        this.onError = onError
        this.cancel$ = new ReplaySubject()
        this.token = null
        this.mapId = null
        this.urlTemplate = null
    }

    equals(o) {
        return _.isEqual(o && o.watchedProps, this.watchedProps)
    }

    createTileProvider() {
        throw new Error('Subclass needs to implement createTileProvider')
    }

    removeFromMap() {
        super.removeFromMap()
        this.cancel$.next()
    }

    initialize$() {
        this.onInitialize && this.onInitialize()
        return this.token
            ? of(this)
            : this.mapId$.pipe(
                tap(({token, mapId, urlTemplate}) => {
                    this.token = token
                    this.mapId = mapId
                    this.urlTemplate = urlTemplate
                    this.onInitialized && this.onInitialized()
                }),
                mapTo(this),
                catchError(error => {
                    this.onError && this.onError(error)
                    return throwError(error)
                }),
                takeUntil(this.cancel$)
            )
    }
}
