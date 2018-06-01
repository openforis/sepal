import ee from 'earthengine-api'
import _ from 'lodash'
import {map} from 'rxjs/operators'
import {sepalMap} from './map'

export default class EarthEngineImageLayer {
    constructor({bounds, mapId$, props, onProgress}) {
        this.bounds = bounds
        this.mapId$ = mapId$
        this.props = props
        this.onProgress = onProgress
    }

    equals(o) {
        return _.isEqual(o && o.props, this.props)
    }

    addToMap(googleMap) {
        const layer = new ee.layers.ImageOverlay(
            new ee.layers.EarthEngineTileSource('https://earthengine.googleapis.com/map', this.mapId, this.token)
        )
        googleMap.overlayMapTypes.push(layer)
        const notifyOnProgress = () => {
            const tiles = {
                count: layer.getLoadingTilesCount()
                    + layer.getLoadedTilesCount()
                    + layer.getFailedTilesCount(),
                loading: layer.getLoadingTilesCount(),
                failed: layer.getFailedTilesCount(),
                loaded: layer.getLoadedTilesCount()
            }
            tiles.complete = tiles.count === tiles.loaded

            if (tiles.count > 0)
                this.onProgress(tiles)
            else
                setTimeout(notifyOnProgress, 100)
        }
        this.boundsChangedListener = sepalMap.onBoundsChanged(notifyOnProgress)
        notifyOnProgress()
        layer.addEventListener('tile-load', notifyOnProgress)
        layer.addEventListener('tile-fail', notifyOnProgress)
        layer.name = 'preview'
    }

    removeFromMap(googleMap) {
        sepalMap.removeListener(this.boundsChangedListener)
        const index = googleMap.overlayMapTypes.getArray().findIndex(overlay => overlay.name === 'preview')
        if (index >= 0)
            googleMap.overlayMapTypes.removeAt(index)
    }

    initialize$() {
        return this.mapId$.pipe(
            map(({response: {token, mapId}}) => {
                this.token = token
                this.mapId = mapId
                return this
            })
        )
    }
}