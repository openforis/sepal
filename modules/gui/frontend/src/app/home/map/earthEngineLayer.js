import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import {sepalMap} from './map'
import _ from 'lodash'
import ee from 'earthengine-api'

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
            // Manually calculate stats, since GEE returns stats from multiple zoom-levels
            const tileStatuses = layer.tilesById.getValues()
                .filter(tile => tile.zoom === googleMap.getZoom())
                .map(tile => tile.getStatus())
            const Status = ee.layers.AbstractTile.Status

            const loading = tileStatuses.filter(status => status === Status.LOADING).length
                + tileStatuses.filter(status => status === Status.NEW).length
                + tileStatuses.filter(status => status === Status.THROTTLED).length
            const loaded = tileStatuses.filter(status => status === Status.LOADED).length
            const failed = tileStatuses.filter(status => status === Status.FAILED).length
                + tileStatuses.filter(status => status === Status.ABORTED).length

            const tileStats = {
                count: loading + loaded + failed,
                loading,
                failed,
                loaded
            }
            // console.log(tileStats)
            tileStats.complete = tileStats.count === tileStats.loaded + tileStats.failed

            if (tileStats.count > 0)
                this.onProgress(tileStats)
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
        // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
        googleMap.overlayMapTypes.insertAt(this.layerIndex, null)
        googleMap.overlayMapTypes.removeAt(this.layerIndex + 1)
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
