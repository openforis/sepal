import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import {sepalMap} from './map'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setEETableLayer = (
    {
        contextId,
        layerSpec: {id, tableId, columnName, columnValue, layerIndex = 0},
        destroy$,
        onInitialized
    }) => {
    const watchedProps = {tableId, columnName, columnValue}
    const layer = columnValue
        ? new RecipeGeometryLayer({
            mapId$: api.gee.eeTableMap$({tableId, columnName, columnValue, color: '#5e2926'}),
            layerIndex,
            watchedProps
        }): null
    sepalMap.getContext(contextId).setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({mapId$, layerIndex, watchedProps}) {
        super({layerIndex, mapId$, props: watchedProps})
    }

    initialize$() {
        if (this.token)
            return of(this)
        return this.mapId$.pipe(
            map(({token, mapId, bounds}) => {
                this.token = token
                this.mapId = mapId
                this.bounds = bounds
                return this
            })
        )
    }
}
