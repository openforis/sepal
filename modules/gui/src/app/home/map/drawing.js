const ring = ({geometry: {coordinates}}) => coordinates[0]

const isClosed = ring => {
    if (ring.length < 2) {
        return false
    }
    const [firstLng, firstLat] = ring[0]
    const [lastLng, lastLat] = ring[ring.length - 1]
    return firstLng === lastLng && firstLat === lastLat
}

// An aoi path is stored open, the way the Google Maps drawing library handed it over.
export const toPolygonPath = feature => {
    const coordinates = ring(feature)
    return isClosed(coordinates)
        ? coordinates.slice(0, -1)
        : coordinates
}

// TerraDrawPolygonMode matches on `mode` to decide a feature is its own, and so editable.
export const toPolygonFeature = path => ({
    type: 'Feature',
    properties: {mode: 'polygon'},
    geometry: {
        type: 'Polygon',
        coordinates: [isClosed(path) ? path : [...path, path[0]]]
    }
})

export const toBounds = feature => {
    const coordinates = ring(feature)
    const lngs = coordinates.map(([lng]) => lng)
    const lats = coordinates.map(([, lat]) => lat)
    return [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
    ]
}

// TerraDrawGoogleMapsAdapter reads these straight off the namespace it is handed, but half of them
// live under `core` in the namespace maps.jsx assembles, so it gets a flattened view instead.
export const ADAPTER_MEMBERS = ['Data', 'LatLng', 'LatLngBounds', 'OverlayView', 'Point', 'Size']

export const toAdapterLib = google => ({...google.maps, ...google.maps.core})

// Polygons only: with showCoordinatePoints on, vertices are Point features in the same store, owned
// by bookkeeping the mode keeps privately, and deleting those leaves it holding dead ids.
export const otherPolygonIds = (features, keepId) =>
    features
        .filter(({id, geometry}) => id !== keepId && geometry.type === 'Polygon')
        .map(({id}) => id)
