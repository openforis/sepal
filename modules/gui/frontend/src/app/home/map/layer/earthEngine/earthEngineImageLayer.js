import {EarthEngineTileProvider} from '../../tileProvider/earthEngineTileProvider'
import {Subject} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export default class EarthEngineImageLayer extends EarthEngineLayer {

    constructor({
        map,
        previewRequest,
        layerIndex,
        progress$,
        onInitialize,
        onInitialized,
        onError,
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
            progress$,
            layerIndex,
            mapId$: api.gee.preview$(previewRequest),
            watchedProps: watchedProps || previewRequest,
            onInitialize,
            onInitialized,
            onError
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
