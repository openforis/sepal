import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {ReplaySubject, Subject, throwError} from 'rxjs'
import {TileLayer} from './googleMapsLayer'
import {catchError, mapTo, takeUntil, tap} from 'rxjs/operators'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineLayer {
    constructor({
        map,
        dataTypes,
        visParams,
        layerIndex = 0,
        label,
        description,
        previewRequest,
        mapId$,
        progress$,
        cursorValue$,
        boundsChanged$,
        dragging$,
        cursor$,
        onInitialize,
        onInitialized,
        onError
    }) {
        this.dataTypes = dataTypes
        this.visParams = visParams
        this.map = map
        this.layerIndex = layerIndex
        this.label = label
        this.description = description
        this.mapId$ = mapId$ || api.gee.preview$(previewRequest)
        this.props = previewRequest
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
        return _.isEqual(o && o.props, this.props)
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
        return this.mapId$.pipe(
            tap(({response: {token, mapId, urlTemplate}}) => {
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
