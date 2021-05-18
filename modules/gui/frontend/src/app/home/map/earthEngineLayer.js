import {EarthEngineTileProvider} from './tileProvider/earthEngineTileProvider'
import {Subject, of} from 'rxjs'
import {TileLayer} from './googleMaps/googleMapsLayer'
import {mapTo, tap} from 'rxjs/operators'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineLayer {
    static create({previewRequest, dataTypes, visParams, map, progress$, cursorValue$, boundsChanged$, dragging$, cursor$, onInitialize, onInitialized}) {
        return new EarthEngineLayer({
            map,
            dataTypes,
            visParams,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            progress$,
            cursorValue$,
            boundsChanged$,
            dragging$,
            cursor$,
            onInitialize,
            onInitialized
        })
    }

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
    }

    equals(o) {
        return _.isEqual(o && o.props, this.props)
    }

    addToMap() {
        const {map, layerIndex, progress$} = this
        const tileProvider = this.createTileProvider()
        this.layer = TileLayer({map, tileProvider, layerIndex, progress$})
        this.layer.add()
    }

    createTileProvider() {
        const {urlTemplate} = this
        this.tileProvider = new EarthEngineTileProvider({
            urlTemplate,
            dataTypes: this.dataTypes,
            visParams: this.visParams,
            cursorValue$: this.cursorValue$,
            boundsChanged$: this.boundsChanged$,
            dragging$: this.dragging$,
            cursor$: this.cursor$
        })
        return this.tileProvider
    }

    removeFromMap() {
        this.layer && this.layer.remove()
    }

    hide(hidden) {
        this.layer && this.layer.hide(hidden)
    }

    close() {
        this.tileProvider && this.tileProvider.close()
    }

    initialize$() {
        this.onInitialize && this.onInitialize()
        return this.mapId
            ? of(this)
            : this.mapId$.pipe(
                tap(({response: {token, mapId, urlTemplate}}) => {
                    this.token = token
                    this.mapId = mapId
                    this.urlTemplate = urlTemplate
                    this.onInitialized && this.onInitialized()
                }),
                mapTo(this)
            )
    }
}
