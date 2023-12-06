import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {Subject, finalize, tap} from 'rxjs'
import {TileLayer} from './tileLayer'
import {isEqual} from 'hash'
import {publishEvent} from 'eventPublisher'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineImageLayer extends TileLayer {
    constructor({
        map,
        layerIndex = 0,
        busy$,
        previewRequest,
        watchedProps,
        dataTypes,
        visParams,
        cursorValue$,
        boundsChanged$,
        dragging$,
        cursor$,
        minZoom,
        maxZoom,
    }) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.busy$ = busy$
        this.previewRequest = previewRequest
        this.dataTypes = dataTypes
        this.visParams = visParams
        this.cursorValue$ = cursorValue$
        this.boundsChanged$ = boundsChanged$
        this.dragging$ = dragging$
        this.cursor$ = cursor$ || new Subject()
        this.watchedProps = watchedProps || previewRequest
        this.minZoom = minZoom
        this.maxZoom = maxZoom
    }

    createTileProvider = urlTemplate => {
        const {busy$, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$} = this
        const tileProvider = new EarthEngineTileProvider({
            urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$
        })
        return new BalancingTileProvider({tileProvider, retries: 3, busy$})
    }

    createOverlay = tileProvider => {
        const {map, busy$, minZoom, maxZoom} = this
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({tileProvider, google, minZoom, maxZoom, busy$})
    }

    getMapId$ = () =>
        api.gee.preview$(this.previewRequest).pipe(
            tap(() => publishEvent('ee_image_preview', {
                recipe_type: this.previewRequest.recipe.type,
                bands: (selectFrom(this.previewRequest, 'visParams.bands') || []).join(', ')
            }))
        )

    addToMap$ = () => {
        this.busy$?.next(true)
        return this.getMapId$().pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy$?.next(false))
        )
    }

    equals = other =>
        other === this
            || other instanceof EarthEngineImageLayer
                && isEqual(other.watchedProps, this.watchedProps)
}