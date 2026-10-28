// An Open Foris GeoID: a UUID the GeoID service derives from a geometry. Shared by the AOI panel, which reads
// it out of whatever text a user pastes, and the server, which accepts only the canonical form. Kept free of
// Node and Earth Engine imports so the GUI can load it.

// A GeoID area of interest may be buffered by a whole number of metres. A point needs a buffer to be an area
// at all, so it has its own default and minimum; a boundary is used as it is unless a buffer is given.
export const DEFAULT_POINT_BUFFER_METERS = 250
export const DEFAULT_POLYGON_BUFFER_METERS = 0
export const MIN_POINT_BUFFER_METERS = 10

export const POINT_GEOMETRY_TYPES = ['Point', 'MultiPoint']

// Hyphens are optional and the hex runs are bounded on both sides, so a UUID written without hyphens is found
// while a longer hex string - a hash, say - is not mistaken for one.
const UUID = /(?<![0-9a-f])([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})(?![0-9a-f])/gi
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// {geoId} for exactly one distinct UUID anywhere in the text, otherwise {error: 'NONE' | 'MULTIPLE'}.
export const parseGeoId = text => {
    const geoIds = [...new Set(
        [...String(text ?? '').matchAll(UUID)].map(([_match, ...groups]) => groups.join('-').toLowerCase())
    )]
    if (geoIds.length === 1) {
        return {geoId: geoIds[0]}
    }
    return {error: geoIds.length ? 'MULTIPLE' : 'NONE'}
}

export const isGeoId = value =>
    typeof value === 'string' && CANONICAL_UUID.test(value)

export const isPointGeometryType = type =>
    POINT_GEOMETRY_TYPES.includes(type)

export const defaultBufferMeters = geometryType =>
    isPointGeometryType(geometryType) ? DEFAULT_POINT_BUFFER_METERS : DEFAULT_POLYGON_BUFFER_METERS

// The smallest buffer a geometry type accepts. Before the type is known, the smallest some type accepts.
export const minBufferMeters = geometryType =>
    isPointGeometryType(geometryType) ? MIN_POINT_BUFFER_METERS : 0

export const isBufferMeters = (value, geometryType) =>
    Number.isSafeInteger(value) && value >= minBufferMeters(geometryType)
