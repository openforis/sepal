import {Subject, of, pipe, range, throwError, timer, zip} from 'rxjs'
import {filter, finalize, map, mergeMap, retryWhen, scan, switchMap, takeUntil} from 'rxjs/operators'
import {get$} from 'http-client'
import {getTileManager} from './tileManager/tileManager'
import {v4 as uuid} from 'uuid'
import ee from '@google/earthengine'

export const TileLayer = ({
    layerIndex,
    tileProvider,
    mapContext,
    minZoom = 0,
    maxZoom = 20,
    progress$
}) => {
    const mapLayer = new GoogleMapsLayer(tileProvider, {mapContext, minZoom, maxZoom}, progress$)
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
            mapLayer.setOpacity(hidden ? 0 : 1)
        },

        progress$() {
            // TODO: Implement...
            // {count, loading, failed, loaded, completed}
        }
    }
}

class GoogleMapsLayer {
    constructor(tileProvider, {
        mapContext,
        name,
        minZoom = 0,
        maxZoom = 20,
    } = {}, progress$) {
        this.tileProvider =
            new MonitoringTileProvider(
                new RetryingTileManager(3,
                    new PrioritizingTileProvider(
                        new CancellingTileProvider(
                            tileProvider
                        )
                    )
                ), progress$
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
        this.tileElementById = {}
        this.opacity = 1
    }

    getTile({x, y}, zoom, doc) {
        const tileRequest = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const tileElement = tileRequest.element
        this.tileElementById[tileElement.id] = tileElement
        if (tileRequest.outOfBounds)
            return tileElement

        const tile$ = this.tileProvider.loadTile$(tileRequest)
        // TODO: Error handling
        tile$.subscribe(blob => renderImageBlob(tileElement, blob))
        return tileElement
    }

    releaseTile(tileElement) {
        delete this.tileElementById[tileElement.id]
        this.tileProvider.releaseTile(tileElement.id)
    }

    setOpacity(opacity) {
        if (this.opacity !== opacity) {
            Object.values(this.tileElementById)
                .forEach(tileElement => tileElement.style.opacity = opacity)
            this.tileProvider.hide(!opacity)
            this.opacity = opacity
        }
    }

    close() {
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
    id = uuid()

    getType() {
        this.abstractMethodError('getType')
    }

    getConcurrency() {
        // this.abstractMethodError('getConcurrency')
    }

    loadTile$(_tileRequest) {
        this.abstractMethodError('loadTile$')
    }

    releaseTile(_tileElement) {
        // this.abstractMethodError('releaseTile')
    }

    hide(_hidden) {
        // this.abstractMethodError('hide')
    }

    close() {
        // this.abstractMethodError('close')
    }

    abstractMethodError(method) {
        throw Error(`${method} is expected to be overridden by subclass.`)
    }
}

export class DelegatingTileProvider extends TileProvider {
    constructor(nextTileProvider) {
        super()
        this.nextTileProvider = nextTileProvider
    }

    getType() {
        return this.nextTileProvider.getType()
    }

    getConcurrency() {
        return this.nextTileProvider.getConcurrency()
    }

    loadTile$(tileRequest) {
        return this.nextTileProvider.loadTile$(tileRequest)
    }

    releaseTile(tileElement) {
        return this.nextTileProvider.releaseTile(tileElement)
    }

    hide(hidden) {
        this.nextTileProvider.hide(hidden)
    }

    close() {
        this.nextTileProvider.close()
    }
}

export class MonitoringTileProvider extends DelegatingTileProvider {
    constructor(nextTileProvider, progress$) {
        super()
        this.nextTileProvider = nextTileProvider
        this.requestById = {}
        this.pending$ = new Subject()
        this.pending$.pipe(
            scan((pending, current) => pending += current)
        ).subscribe(
            pending => progress$ && progress$.next({loading: pending})
        )
    }

    addRequest(requestId) {
        this.requestById[requestId] = Date.now()
        this.pending$.next(1)
    }

    removeRequest(requestId) {
        delete this.requestById[requestId]
        this.pending$.next(-1)
    }

    loadTile$(tileRequest) {
        const requestId = tileRequest.id
        this.addRequest(requestId)
        return this.nextTileProvider.loadTile$(tileRequest).pipe(
            finalize(() => this.removeRequest(requestId))
        )
    }

    releaseTile(tileElement) {
        return this.nextTileProvider.releaseTile(tileElement)
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

    getType() {
        return 'EarthEngine'
    }

    getConcurrency() {
        return 4
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

class CancellingTileProvider extends DelegatingTileProvider {
    release$ = new Subject()
    close$ = new Subject()

    constructor(nextTileProvider) {
        super(nextTileProvider)
    }

    loadTile$(tileRequest) {
        const tile$ = super.loadTile$(tileRequest)
        const releaseTile$ = this.release$.pipe(
            filter(requestId => requestId === tileRequest.id)
        )
        return tile$.pipe(
            takeUntil(releaseTile$),
            takeUntil(this.close$)
        )
    }

    releaseTile(requestId) {
        super.releaseTile(requestId)
        this.release$.next(requestId)
    }

    close() {
        super.close()
        this.close$.next()
    }
}

export class PrioritizingTileProvider extends DelegatingTileProvider {
    constructor(nextTileProvider) {
        super(nextTileProvider)
        this.tileManager = getTileManager(nextTileProvider)
    }

    getType() {
        return this.tileManager.getType()
    }

    getConcurrency() {
        return this.tileManager.getConcurrency()
    }

    loadTile$(tileRequest) {
        return this.tileManager.loadTile$(tileRequest)
    }

    releaseTile(requestId) {
        this.tileManager.releaseTile(requestId)
    }

    hide(hidden) {
        this.tileManager.hide(hidden)
    }

    close() {
        this.tileManager.close()
    }
}

class RetryingTileManager extends DelegatingTileProvider {
    constructor(retries, nextTileProvider) {
        super(nextTileProvider)
        this.retries = retries
    }

    loadTile$(tileRequest) {
        return of(true).pipe(
            switchMap(() => super.loadTile$(tileRequest)),
            retry(this.retries, {description: tileRequest.id}),
        )
    }
}

const renderImageBlob = (element, blob) =>
    element.innerHTML = `<img src="${(window.URL || window.webkitURL).createObjectURL(blob)}"/>`

const retry = (maxRetries, {minDelay = 500, maxDelay = 30000, exponentiality = 2, description} = {}) => pipe(
    retryWhen(error$ =>
        zip(
            error$,
            range(1, maxRetries + 1)
        ).pipe(
            mergeMap(
                ([error, retry]) => {
                    if (retry > maxRetries) {
                        return throwError(error)
                    } else {
                        const exponentialBackoff = Math.pow(exponentiality, retry) * minDelay
                        const cappedExponentialBackoff = Math.min(exponentialBackoff, maxDelay)
                        console.error(`Retrying ${description ? `${description} ` : ''}(${retry}/${maxRetries}) in ${cappedExponentialBackoff}ms after error: ${error}`)
                        return timer(cappedExponentialBackoff)
                    }
                }
            )
        )
    )
)
