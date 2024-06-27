import {finalize, Subject, tap} from 'rxjs'

import api from '~/apiRegistry'
import {publishEvent} from '~/eventPublisher'
import {isEqual} from '~/hash'
import {selectFrom} from '~/stateUtils'
import {uuid} from '~/uuid'

import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {TileLayer} from './tileLayer'

export class EarthEngineImageLayer extends TileLayer {
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
