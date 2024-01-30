import {MAX_ZOOM} from '../maps'
import guid from 'guid'

// implements google.maps.MapType
export class GoogleMapsOverlay {
    constructor({
        tileProvider,
        google,
        name,
        minZoom = 0,
        maxZoom = MAX_ZOOM
    }) {
        this.tileProvider = tileProvider
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.tileSize = new google.maps.Size(
            tileProvider.tileSize || 256,
            tileProvider.tileSize || 256
        )
        this.tileSubscriptionById = {}
    }

    getTile({x, y}, zoom, doc) {
        const request = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const element = request.element
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
        this.tileSubscriptionById[element.id].unsubscribe()
        delete this.tileSubscriptionById[element.id]
        this.tileProvider.releaseTile(element)
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
        const id = [this.tileProvider.id, zoom, x, y, guid()].join('/')
        const element = this.tileProvider.createElement(id, doc)
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }
}
