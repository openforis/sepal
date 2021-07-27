import {EarthEngineTileProvider} from '../../tileProvider/earthEngineTileProvider'
import {ReplaySubject, Subject, of, throwError} from 'rxjs'
import {TileLayer} from '../../tileLayer/tileLayer'
import {catchError, mapTo, takeUntil, tap} from 'rxjs/operators'
import Layer from '../layer'
import _ from 'lodash'

export default class EarthEngineLayer extends Layer {
    constructor({
        map,
        dataTypes,
        visParams,
        layerIndex = 0,
        label,
        description,
        mapId$,
        progress$,
        cursorValue$,
        boundsChanged$,
        dragging$,
        cursor$,
        onInitialize,
        onInitialized,
        onError,
        watchedProps
    }) {
        super()
        this.dataTypes = dataTypes
        this.visParams = visParams
        this.map = map
        this.layerIndex = layerIndex
        this.label = label
        this.description = description
        this.mapId$ = mapId$
        this.watchedProps = watchedProps
        this.progress$ = progress$
        this.cursorValue$ = cursorValue$
        this.boundsChanged$ = boundsChanged$
        this.dragging$ = dragging$
        this.cursor$ = cursor$ || new Subject()
        this.onInitialize = onInitialize
        this.onInitialized = onInitialized
        this.onError = onError
        this.cancel$ = new ReplaySubject()
    }

    equals(o) {
        return _.isEqual(o && o.watchedProps, this.watchedProps)
    }

    createTileProvider() {
        const {urlTemplate} = this
        return new EarthEngineTileProvider({
            urlTemplate,
            dataTypes: this.dataTypes,
            visParams: this.visParams,
            cursorValue$: this.cursorValue$,
            boundsChanged$: this.boundsChanged$,
            dragging$: this.dragging$,
            cursor$: this.cursor$
        })
    }

    addToMap() {
        const {map, layerIndex, progress$} = this
        const tileProvider = this.createTileProvider()
        this.tileLayer = new TileLayer({map, tileProvider, layerIndex, progress$})
        this.tileLayer.add()
    }

    removeFromMap() {
        this.tileLayer && this.tileLayer.remove()
        this.cancel$.next()
    }

    hide(hidden) {
        this.tileLayer && this.tileLayer.hide(hidden)
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
