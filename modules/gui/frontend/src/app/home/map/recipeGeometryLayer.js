import api from 'api'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import EarthEngineLayer from './earthEngineLayer'
import {sepalMap} from './map'

export const setRecipeGeometryLayer = (
    {
        contextId,
        layerSpec: {id, recipe, layerIndex = 0},
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
