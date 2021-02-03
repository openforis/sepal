import {Subject} from 'rxjs'
import {filter, map, takeUntil} from 'rxjs/operators'
import {get$} from 'http-client'
import ee from '@google/earthengine'
import guid from 'guid'

export const TileLayer = ({
    layerIndex,
    tileProvider,
    mapContext,
    minZoom = 0,
    maxZoom = 20
}) => {
    const mapLayer = new GoogleMapsLayer(tileProvider, {mapContext, minZoom, maxZoom})
    return {
        add() {
            mapContext.googleMap.overlayMapTypes.setAt(layerIndex, mapLayer)
        },

        remove() {
            // TODO: Only do this if added to the map
            // TODO: Unregister listeners
            // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
            mapContext.googleMap.overlayMapTypes.insertAt(layerIndex, null)
            mapContext.googleMap.overlayMapTypes.removeAt(layerIndex + 1)
        },

        hide(hidden) {
            tileProvider.hide(hidden)
            mapLayer.setOpacity(hidden ? 0 : 1)
        },

        progress$() {
            // TODO: Implement...
            // {count, loading, failed, loaded, completed}
        }
    }
}

class GoogleMapsLayer {
    subscriptions = []

    constructor(tileProvider, {
        mapContext,
        name,
        minZoom = 0,
        maxZoom = 20,
    } = {}) {
        this.tileProvider =
            new PrioritizingTileProvider(
                new CancellingTileProvider(
                    tileProvider
                )
            )
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.tileSize = new mapContext.google.maps.Size(
            tileProvider.tileSize || 256,
            tileProvider.tileSize || 256
        )
        this.alt = undefined
        this.projection = undefined
        this.radius = undefined
    }

    getTile({x, y}, zoom, doc) {
        const tileRequest = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        if (tileRequest.outOfBounds)
            return tileRequest.element

        const tile$ = this.tileProvider.loadTile$(tileRequest)
        // TODO: Error handling
        tile$.subscribe(blob => renderImageBlob(tileRequest.element, blob))
        return tileRequest.element
    }

    releaseTile(tileElement) {
        this.tileProvider.releaseTile(tileElement.id)
    }

    addSubscription(subscription) {
        this.subscriptions.push(subscription)
    }

    setOpacity(opacity) {
        // TODO: Implement?
        // this.opacity = opacity
        // this.tilesById.forEach(function(tile) {
        //     goog.style.setOpacity(tile.div, this.opacity)
        // }, this)
    }

    close() {
        this.subscribers.forEach(subscription => subscription.unsubscribe())
        this.tileProvider.close()
    }

    _toTileRequest({x, y, zoom, minZoom, doc}) {
        const maxCoord = 1 << zoom
        x = x % maxCoord
        if (x < 0) {
            x += maxCoord
        }
        const element = doc.createElement('div')
        const id = [this.tileProvider.id, zoom, x, y].join('/')
        element.id = id
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }

}

export class TileProvider {
    id = guid()

    loadTile$(tileRequest) {
        throw Error('loadTile$ is expected to be overridden by subclass.')
    }

    releaseTile(tileElement) {
    }

    hide() {
    }

    close() {
    }
}

export class EarthEngineTileProvider extends TileProvider {
    constructor({mapId, token, urlTemplate}) {
        super()
        this.mapId = mapId
        this.token = token
        this.formatTileUrl = (x, y, z) => {
            const width = Math.pow(2, z)
            x = x % width
            if (x < 0) {
                x += width
            }
            return urlTemplate
                .replace('{x}', x)
                .replace('{y}', y)
                .replace('{z}', z)
        }
        this.tileSize = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
    }

    loadTile$({x, y, zoom}) {
        const url = this.formatTileUrl(x, y, zoom)
        return get$(url, {
            retries: 0,
            responseType: 'blob',
            mode: 'no-cors'
        }).pipe(
            map(e => e.response)
        )
    }
}

class CancellingTileProvider extends TileProvider {
    release$ = new Subject()
    close$ = new Subject()

    constructor(nextTileProvider) {
        super()
        this.nextTileProvider = nextTileProvider
    }

    loadTile$(tileRequest) {
        const tile$ = this.nextTileProvider.loadTile$(tileRequest)
        const releaseTile$ = this.release$.pipe(
            filter(requestId => requestId === tileRequest.id)
        )
        return tile$.pipe(
            takeUntil(releaseTile$),
            takeUntil(this.close$)
        )
    }

    releaseTile(requestId) {
        this.release$.next(requestId)
        this.nextTileProvider.releaseTile()
    }

    close() {
        this.close.next()
        this.nextTileProvider.close()
    }
}

export class PrioritizingTileProvider extends TileProvider {
    constructor(nextTileProvider) {
        super()
        this.nextTileProvider = nextTileProvider
    }

    loadTile$(tileRequest) {
        // TODO: Implement...
        // Should enqueue request
        return this.nextTileProvider.loadTile$(tileRequest)
    }

    releaseTile(requestId) {
        // TODO: Implement...
        // Should remove request from queue
        this.nextTileProvider.releaseTile()
    }

    hide(hidden) {
        // TODO: Implement...
        // Should change priority for requests enqueued by provider
    }

    close() {
        this.nextTileProvider.close()
    }
}

const renderImageBlob = (element, blob) =>
    element.innerHTML = `<img src="${(window.URL || window.webkitURL).createObjectURL(blob)}"/>`

