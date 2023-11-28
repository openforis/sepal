import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {GoogleMapsOverlay} from './googleMapsOverlay'
import {Layer} from './layer'
import {Subject, finalize, tap} from 'rxjs'
import {isEqual} from 'hash'
import {publishEvent} from 'eventPublisher'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'
import api from 'api'

export default class EarthEngineImageLayer extends Layer {
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
        const {dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$} = this
        return new EarthEngineTileProvider({
            urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$
        })
    }

    createOverlay = urlTemplate => {
        const {map, busy$, minZoom, maxZoom} = this
        const tileProvider = this.createTileProvider(urlTemplate)
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

    addToMap = urlTemplate => {
        this.layer = this.createOverlay(urlTemplate)
        const {map, layerIndex, layer} = this
        const {googleMap} = map.getGoogle()
        if (layer) {
            googleMap.overlayMapTypes.setAt(layerIndex, layer)
        }
    }

    addToMap$ = () => {
        this.busy$?.next(true)
        return this.getMapId$().pipe(
            tap(({urlTemplate}) => this.addToMap(urlTemplate)),
            finalize(() => this.busy$?.next(false))
        )
    }

    removeFromMap = () => {
        const {map, layerIndex, layer} = this
        const {googleMap} = map.getGoogle()
        if (layer) {
            googleMap.overlayMapTypes.removeAt(layerIndex)
            // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
            // googleMap.overlayMapTypes.insertAt(layerIndex, null)
            // googleMap.overlayMapTypes.removeAt(layerIndex + 1)
            layer.close()
        }
    }

    hide = hidden => {
        const {layer} = this
        if (layer) {
            layer.setOpacity(hidden ? 0 : 1)
        }
    }

    equals = other =>
        other === this
            || other instanceof EarthEngineImageLayer
                && isEqual(other.watchedProps, this.watchedProps)
}
