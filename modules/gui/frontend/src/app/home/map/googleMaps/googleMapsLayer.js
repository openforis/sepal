import {BalancingTileProvider} from '../tileProvider/balancingTileProvider'
import guid from 'guid'

export class TileLayer {
    constructor({
        layerIndex,
        tileProvider,
        map,
        minZoom = 0,
        maxZoom = 20,
        progress$
    }) {
        const {google} = map.getGoogle()
        this.map = map
        this.layerIndex = layerIndex
        this.mapLayer = new GoogleMapsLayer(tileProvider, {google, minZoom, maxZoom}, progress$)
    }

    add() {
        const {map, layerIndex, mapLayer} = this
        map.addToMap(layerIndex, mapLayer)
    }

    remove() {
        const {map, layerIndex, mapLayer} = this
        map.removeFromMap(layerIndex)
        mapLayer.close()
    }

    hide(hidden) {
        const {mapLayer} = this
        mapLayer.setOpacity(hidden ? 0 : 1)
    }
}

class GoogleMapsLayer {
    constructor(tileProvider, {
        google,
        name,
        minZoom = 0,
        maxZoom = 20,
    } = {}, progress$) {
        this.tileProvider = new BalancingTileProvider({tileProvider, reties: 3, progress$})
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.tileSize = new google.maps.Size(
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
        const request = this._toTileRequest({x, y, zoom, minZoom: this.minZoom, doc})
        const element = request.element
        this.tileElementById[element.id] = element
        if (request.outOfBounds)
            return element

        const tile$ = this.tileProvider.loadTile$(request)
        tile$.subscribe(blob => this.tileProvider.renderTile({doc, element, blob}))
        return element
    }

    releaseTile(tileElement) {
        delete this.tileElementById[tileElement.id]
        this.tileProvider.releaseTile(tileElement)
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
        const id = [this.tileProvider.id, zoom, x, y, guid()].join('/')
        const element = this.tileProvider.createElement(id, doc)
        element.style.opacity = this.opacity
        const outOfBounds = zoom < minZoom || y < 0 || y >= maxCoord
        return {id, x, y, zoom, element, outOfBounds}
    }
}
