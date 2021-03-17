import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setEETableLayer = ({
    sepalMap,
    layerSpec: {id, tableId, columnName, columnValue, buffer, layerIndex = 1},
    destroy$,
    onInitialized,
}) => {
    const watchedProps = {tableId, columnName, columnValue, buffer}
    const layer = tableId
        ? new RecipeGeometryLayer({
            sepalMap,
            mapId$: api.gee.eeTableMap$({tableId, columnName, columnValue, buffer, color: '#FFFFFF50', fillColor: '#FFFFFF08'}),
            layerIndex,
            watchedProps
        }) : null
    sepalMap.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({sepalMap, mapId$, layerIndex, watchedProps}) {
        super({sepalMap, layerIndex, mapId$, props: watchedProps})
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
