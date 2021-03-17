import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setEETableLayer = ({
    map,
    layerSpec: {id, tableId, columnName, columnValue, buffer, layerIndex = 1},
    destroy$,
    onInitialized,
}) => {
    const watchedProps = {tableId, columnName, columnValue, buffer}
    const layer = tableId
        ? new RecipeGeometryLayer({
            map,
            mapId$: api.gee.eeTableMap$({tableId, columnName, columnValue, buffer, color: '#FFFFFF50', fillColor: '#FFFFFF08'}),
            layerIndex,
            watchedProps
        }) : null
    map.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, watchedProps}) {
        super({map, layerIndex, mapId$, props: watchedProps})
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
