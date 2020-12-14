import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setRecipeGeometryLayer = ({
    mapContext,
    layerSpec: {id, recipe, layerIndex = 1},
    destroy$,
    onInitialized
}) => {
    const layer = recipe
        ? new RecipeGeometryLayer({mapContext, mapId$: api.gee.recipeGeometry$(recipe), layerIndex, recipe})
        : null
    mapContext.sepalMap.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({mapContext, mapId$, layerIndex, recipe}) {
        super({mapContext, layerIndex, mapId$, props: recipe})
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
