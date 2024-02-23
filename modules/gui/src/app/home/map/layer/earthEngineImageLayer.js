import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {Subject, finalize, tap} from 'rxjs'
import {TileLayer} from './tileLayer'
import {isEqual} from 'hash'
import {publishEvent} from 'eventPublisher'
import {selectFrom} from 'stateUtils'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineImageLayer extends TileLayer {
    constructor({
        map,
        layerIndex = 0,
        busy,
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
        this.busy = busy
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
        const {busy, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$} = this
        const tileProvider = new EarthEngineTileProvider({
            urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$
        })
        return new BalancingTileProvider({
            tileProvider,
            busy,
            renderingEnabled$: this.map.renderingEnabled$,
            renderingStatus$: this.map.renderingStatus$
        })
    }

    createOverlay = tileProvider => {
        const {map, minZoom, maxZoom} = this
        const {google} = map.getGoogle()
        return new GoogleMapsOverlay({name: 'EarthEngineImageLayer', tileProvider, google, minZoom, maxZoom})
    }

    getMapId$ = () =>
        api.gee.preview$(this.previewRequest).pipe(
            tap(() => publishEvent('ee_image_preview', {
                recipe_type: this.previewRequest.recipe.type,
                bands: (selectFrom(this.previewRequest, 'visParams.bands') || []).join(', ')
            }))
        )

    addToMap$ = () => {
        const id = `EarthEngineImageLayer-${uuid()}`
        this.busy.set(id, true)
        return this.getMapId$().pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy.set(id, false))
        )
    }

    equals = other =>
        other === this
            || other instanceof EarthEngineImageLayer
                && isEqual(other.watchedProps, this.watchedProps)
}
