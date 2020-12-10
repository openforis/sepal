import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setEETableLayer = ({
    mapContext,
    layerSpec: {id, tableId, columnName, columnValue, layerIndex = 1},
    destroy$,
    onInitialized,
}) => {

    const watchedProps = {tableId, columnName, columnValue}
    const layer = tableId
        ? new RecipeGeometryLayer({
            mapContext,
            mapId$: api.gee.eeTableMap$({tableId, columnName, columnValue, color: '#FFFFFF50', fillColor: '#FFFFFF08'}),
            layerIndex,
            watchedProps
        }) : null
    mapContext.sepalMap.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({mapContext, mapId$, layerIndex, watchedProps}) {
        super({mapContext, layerIndex, mapId$, props: watchedProps})
    }

    initialize$() {
        if (this.token)
            return of(this)
        return this.mapId$.pipe(
            map(({token, mapId, urlTemplate, bounds}) => {
                this.token = token
                this.mapId = mapId
                this.urlTemplate = urlTemplate
                this.bounds = bounds
                return this
            })
        )
    }
}
