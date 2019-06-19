import ee from 'earthengine-api'
import  {google} from './map'

export class GoogleMapsLayer {
    constructor(tileProvider, {
        name,
        minZoom = 0,
        maxZoom = 20,
        tileSize = 256,
        opacity = 1
    } = {}) {
        this.tileProvider = tileProvider
        this.name = name
        this.minZoom = minZoom
        this.maxZoom = maxZoom
        this.tileSize = new google.maps.Size(
            ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH,
            ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
        )
        this.alt = undefined;
        this.projection = undefined;
        this.radius = undefined;
    }

    getTile({x, y}, zoom, doc) {
        console.log('getTile', {x, y, zoom, ownerDocument: doc})
        const coord = toCoord({x, y, zoom})
        if (coord.outOfBounds)
            return createEmptyTile(doc)


        // TODO: Could this tile already have been loaded?
        // Cache tiles until they are disposed?

        return this.tileProvider.loadTile(coord, doc)
    }

    releaseTile(tile) {
        console.log('releaseTile', {tile})
    }
}

const createEmptyTile = (doc) => doc.createElement('div')

const toCoord = ({x, y, zoom}) => {
    const maxCoord = 1 << zoom
    x = x % maxCoord
    if (x < 0) {
        x += maxCoord
    }
    return {
        outOfBounds: zoom < this.minZoom || y < 0 || y >= maxCoord,
        point: new google.maps.Point(x, y),
        zoom: zoom
    }

}

// https://developers.google.com/maps/documentation/javascript/reference/image-overlay#MapType
// https://developers.google.com/maps/documentation/javascript/maptypes

const tile$ = null

export class EarthEngineTileProvider {
    loadTile(coord, doc) {
        return doc.createElement('div')
    }
}
