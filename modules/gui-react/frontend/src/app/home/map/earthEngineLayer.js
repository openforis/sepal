import ee from 'earthengine-api'
import _ from 'lodash'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import {sepalMap} from './map'

export default class EarthEngineImageLayer {
    constructor({layerIndex, bounds, mapId$, props, onProgress}) {
        this.layerIndex = layerIndex
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
        googleMap.overlayMapTypes.setAt(this.layerIndex, layer)
        const notifyOnProgress = () => {
            const tiles = {
                count: layer.getLoadingTilesCount()
                    + layer.getLoadedTilesCount()
                    + layer.getFailedTilesCount(),
                loading: layer.getLoadingTilesCount(),
                failed: layer.getFailedTilesCount(),
                loaded: layer.getLoadedTilesCount()
            }
            tiles.complete = tiles.count === tiles.loaded + layer.getFailedTilesCount()

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
        googleMap.overlayMapTypes.setAt(this.layerIndex, null)
    }

    hide(googleMap, hidden) {
        const layer = googleMap.overlayMapTypes.getAt(this.layerIndex)
        layer && layer.setOpacity(hidden ? 0 : 1)
    }

    initialize$() {
        if (this.token)
            return of(this)
        return this.mapId$.pipe(
            map(({response: {token, mapId}}) => {
                this.token = token
                this.mapId = mapId
                return this
            })
        )
    }
}