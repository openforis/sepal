import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {ReplaySubject, Subject, of} from 'rxjs'
import {TileLayer} from './googleMapsLayer'
import {mapTo, takeUntil, tap} from 'rxjs/operators'
import _ from 'lodash'

export default class EarthEngineLayer {
    constructor({
        map,
        dataTypes,
        visParams,
        layerIndex = 0,
        label,
        description,
        mapId$,
        props,
        progress$,
        cursorValue$,
        boundsChanged$,
        dragging$,
        cursor$,
        onInitialize,
        onInitialized
    }) {
        this.dataTypes = dataTypes
        this.visParams = visParams
        this.map = map
        this.layerIndex = layerIndex
        this.label = label
        this.description = description
        this.mapId$ = mapId$
        this.props = props
        this.progress$ = progress$
        this.cursorValue$ = cursorValue$
        this.boundsChanged$ = boundsChanged$
        this.dragging$ = dragging$
        this.cursor$ = cursor$ || new Subject()
        this.onInitialize = onInitialize
        this.onInitialized = onInitialized
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
        return this.token
            ? of(this)
            : this.mapId$.pipe(
                tap(({response: {token, mapId, urlTemplate}}) => {
                    this.token = token
                    this.mapId = mapId
                    this.urlTemplate = urlTemplate
                    this.onInitialized && this.onInitialized()
                }),
                mapTo(this),
                takeUntil(this.cancel$)
            )
    }
}
