import {uuid} from '~/uuid'

import {MAX_ZOOM} from '../maps'

// implements google.maps.MapType
export class GoogleMapsOverlay {
    constructor({
        tileProvider,
        google,
        name,
        minZoom = 0,
        maxZoom = MAX_ZOOM,
        opacity = 1
    }) {
        this.tileProvider = tileProvider
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.opacity = opacity
        this.tileSize = new google.maps.core.Size(
            tileProvider.tileSize || 256,
            tileProvider.tileSize || 256
        )
        this.tileSubscriptionById = {}
        // Mounted tile elements, so a live opacity change can restyle them without refetching.
        this.tileElementById = {}
    }

    getTile({x, y}, zoom, doc) {
        const request = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const element = request.element
        this.tileElementById[element.id] = element
        // Whole-layer tile opacity: applied per tile element, uniform across the layer (tiles don't overlap).
        if (this.opacity !== 1) {
            element.style.opacity = this.opacity
        }
        if (request.outOfBounds) {
            return element
        }

        const subscription = this.tileProvider.loadTile$(request).subscribe({
            next: blob => this.tileProvider.renderTile({element, blob}),
            error: error => this.tileProvider.renderErrorTile({element, error})
        })
        this.tileSubscriptionById[element.id] = subscription
        return element
    }

    releaseTile(element) {
        const tileSubscription = this.tileSubscriptionById[element.id]
        if (tileSubscription) {
            tileSubscription.unsubscribe()
            delete this.tileSubscriptionById[element.id]
            this.tileProvider.releaseTile(element)
        }
        delete this.tileElementById[element.id]
    }

    // Client-side whole-layer opacity: restyle the mounted tiles in place. No tile or map-id refetch - this
    // is just CSS on already-rendered tile elements.
    setOpacity(opacity) {
        this.opacity = opacity
        Object.values(this.tileElementById).forEach(element => {
            element.style.opacity = opacity
        })
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
        const id = [this.tileProvider.id, zoom, x, y, uuid()].join('/')
        const element = this.tileProvider.createElement(id, doc)
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }
}
