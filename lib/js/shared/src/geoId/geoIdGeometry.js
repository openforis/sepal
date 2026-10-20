// What makes a geometry from the GeoID service usable as an area of interest: one of the types the service
// mints, in EPSG:4326, with something in it. A recognized type alone is not enough - Earth Engine would
// otherwise be handed coordinates it either rejects late or silently misplaces.

const COORDINATE_RULES = {
    Point: position => isPosition(position),
    MultiPoint: positions => isNonEmptyArray(positions) && positions.every(isPosition),
    Polygon: rings => isPolygon(rings),
    MultiPolygon: polygons => isNonEmptyArray(polygons) && polygons.every(isPolygon)
}

// A reason the geometry cannot be used, or null when it can.
export const geoIdGeometryProblem = geometry => {
    if (!geometry || typeof geometry !== 'object') {
        return 'no geometry'
    }
    const rule = Object.hasOwn(COORDINATE_RULES, geometry.type) ? COORDINATE_RULES[geometry.type] : null
    if (!rule) {
        return `unsupported geometry type: ${geometry.type}`
    }
    return rule(geometry.coordinates)
        ? null
        : `invalid ${geometry.type} coordinates`
}

const isPolygon = rings =>
    isNonEmptyArray(rings) && rings.every(isLinearRing)

const isLinearRing = ring =>
    Array.isArray(ring)
        && ring.length >= 4
        && ring.every(isPosition)
        && ring[0][0] === ring[ring.length - 1][0]
        && ring[0][1] === ring[ring.length - 1][1]

const isPosition = position =>
    Array.isArray(position)
        && position.length >= 2
        && position.every(Number.isFinite)
        && Math.abs(position[0]) <= 180
        && Math.abs(position[1]) <= 90

const isNonEmptyArray = value =>
    Array.isArray(value) && value.length > 0
