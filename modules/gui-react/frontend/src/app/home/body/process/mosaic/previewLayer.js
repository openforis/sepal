import {ee, map} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import {map as rxMap} from 'rxjs/operators'

export const setPreviewLayer = ({contextId, recipe, destroy$, onInitialized}) => {
    const id = 'preview'
    const layer = recipe.ui.initialized ? new Preview(recipe) : null
    map.getLayers(contextId).set({id, layer, destroy$, onInitialized})
    return layer
}

class Preview {
    constructor(recipe) {
        this.recipe = recipe
        this.bounds = recipe.aoi.bounds
    }

    equals(o) {
        const equals = _.isEqual(
            o && _.omit(o.recipe, 'ui'),
            _.omit(this.recipe, 'ui')
        )
        return equals
    }

    addToMap(googleMap) {
        console.log(this)
        const layer = new ee.layers.ImageOverlay(
            new ee.layers.EarthEngineTileSource('https://earthengine.googleapis.com/map', this.mapId, this.token)
        )
        layer.name = 'preview'
        googleMap.overlayMapTypes.push(layer)
    }

    removeFromMap(googleMap) {
        console.log('removeFromMap')
        const index = googleMap.overlayMapTypes.getArray().findIndex(overlay => overlay.name === 'preview')
        if (index >= 0)
            googleMap.overlayMapTypes.removeAt(index)
    }

    initialize$() {
        return backend.gee.preview$(this.recipe).pipe(
            rxMap(({response: {token, mapId}}) => {
                this.token = token
                this.mapId = mapId
                return this
            })
        )
    }
}