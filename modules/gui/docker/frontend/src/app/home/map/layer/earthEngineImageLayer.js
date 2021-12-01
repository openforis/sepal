import {EarthEngineTileProvider} from '../tileProvider/earthEngineTileProvider'
import {Subject, tap} from 'rxjs'
import {publishEvent} from 'eventPublisher'
import {selectFrom} from 'stateUtils'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export default class EarthEngineImageLayer extends EarthEngineLayer {
    constructor({
        map,
        previewRequest,
        layerIndex,
        busy$,
        watchedProps,
        dataTypes,
        visParams,
        cursorValue$,
        boundsChanged$,
        dragging$,
        cursor$
    }) {
        super({
            map,
            busy$,
            layerIndex,
            mapId$: api.gee.preview$(previewRequest).pipe(
                tap(() => publishEvent('ee_image_preview', {
                    recipe_type: previewRequest.recipe.type,
                    bands: (selectFrom(previewRequest, 'visParams.bands') || []).join(', ')
                }))
            ),
            watchedProps: watchedProps || previewRequest
        })

        this.dataTypes = dataTypes
        this.visParams = visParams
        this.cursorValue$ = cursorValue$
        this.boundsChanged$ = boundsChanged$
        this.dragging$ = dragging$
        this.cursor$ = cursor$ || new Subject()
    }

    createTileProvider() {
        const {urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$} = this
        return new EarthEngineTileProvider({
            urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$
        })
    }
}
