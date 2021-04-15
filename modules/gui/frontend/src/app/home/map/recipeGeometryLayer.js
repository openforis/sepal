import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import EarthEngineLayer from './earthEngineLayer'
import api from 'api'

export const setRecipeGeometryLayer = ({
    map,
    layerSpec: {id, recipe, layerIndex = 1},
    destroy$,
    onInitialized
}) => {
    const layer = recipe
        ? new RecipeGeometryLayer({map, mapId$: api.gee.recipeGeometry$(recipe), layerIndex, recipe})
        : null
    map.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class RecipeGeometryLayer extends EarthEngineLayer {
    constructor({map, mapId$, layerIndex, recipe}) {
        super({map, layerIndex, mapId$, props: recipe})
    }

    initialize$() {
        if (this.token)
            return of(this)
        return this.mapId$.pipe(
            map(({token, mapId, urlTemplate}) => {
                this.token = token
                this.mapId = mapId
                this.urlTemplate = urlTemplate
                return this
            })
        )
    }
}
