import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setRecipeGeometryLayer = ({
    sepalMap,
    layerSpec: {id, recipe, layerIndex = 1},
    destroy$,
    onInitialized
}) => {
    const layer = recipe
        ? new RecipeGeometryLayer({sepalMap, mapId$: api.gee.recipeGeometry$(recipe), layerIndex, recipe})
        : null
    sepalMap.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({sepalMap, mapId$, layerIndex, recipe}) {
        super({sepalMap, layerIndex, mapId$, props: recipe})
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
