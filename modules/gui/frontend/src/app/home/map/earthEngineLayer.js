import {map} from 'rxjs/operators'
import {of} from 'rxjs'
import {sepalMap} from './map'
import _ from 'lodash'
import ee from 'earthengine-api'
import guid from 'guid'

export default class EarthEngineLayer {
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
            new ee.layers.EarthEngineTileSource(
                toMapId(this.mapId, this.token)
            )
        )




        // [HACK] When fitting bounds with no change to bounds, after Google Maps v3.33,
        // tiles were loaded then removed. GEE used same id for tiles at the same position.
        // This caused freshly loaded tiles to be immediately removed.
        // This workaround uses unique tile ids. Hopefully this doesn't lead to any memory leaks.
        layer.getUniqueTileId_ = () => guid()

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
            tileStats.complete = tileStats.count === tileStats.loaded + tileStats.failed

            if (this.onProgress && tileStats.count > 0)
                this.onProgress(tileStats)
            else
                setTimeout(notifyOnProgress, 100)
        }
        this.boundsChangedListener = sepalMap.onBoundsChanged(notifyOnProgress)
        notifyOnProgress()
        layer.addEventListener('tile-load', notifyOnProgress)
        layer.addEventListener('tile-fail', notifyOnProgress)
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

// Creates a ee.data.RawMapId.
// https://github.com/google/earthengine-api/blob/1a3121aa7574ecf2d5432c047621081aed8e1b28/javascript/src/data.js#L2198
const toMapId = (mapid, token) => {
    const path = `https://earthengine.googleapis.com/map/${mapid}`
    const suffix = `?token=${token}`
    // Builds a URL of the form {tileBaseUrl}{path}/{z}/{x}/{y}{suffix}
    const formatTileUrl = (x, y, z) => {
        const width = Math.pow(2, z)
        x = x % width
        if (x < 0) {
            x += width
        }
        return [path, z, x, y].join('/') + suffix
    }
    return {mapid, token, formatTileUrl}
}
