import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import {sepalMap} from './map'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setRecipeGeometryLayer = (
    {
        contextId,
        layerSpec: {id, recipe, layerIndex},
        destroy$,
        onInitialized
    }) => {

    const layer = recipe
        ? new RecipeGeometryLayer({mapId$: api.gee.recipeGeometry$(recipe), layerIndex, recipe})
        : null
    sepalMap.getContext(contextId).setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({mapId$, layerIndex, recipe}) {
        super({layerIndex, mapId$: mapId$, props: recipe})
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
