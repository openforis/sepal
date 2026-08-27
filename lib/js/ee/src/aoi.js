import {map, of, throwError} from 'rxjs'

import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {propertyEqualityFilter} from '#sepal/ee/propertyFilter'

// GEOMETRY is an in-process wrapper for an already-resolved EE geometry, not a persisted AOI type.
// Raw computed objects remain unsupported so descriptor mistakes fail loudly.
const geometryAoi = geometry => ({
    type: 'GEOMETRY',
    geometry
})

// The only exported geometry authority. ASSET and RECIPE aois are descriptors referencing images whose
// geometry must be resolved asynchronously; the rest are built here. Every branch is enumerated: an aoi
// that falls through as a descriptor is what produced "geometry.bounds is not a function", so an
// unrecognised type fails loudly rather than reaching Earth Engine.
const toGeometry$ = aoi => {
    if (!aoi) {
        return of(null)
    }
    switch (aoi.type) {
        case 'ASSET':
            return referencedGeometry$(aoi, 'ASSET')
        case 'RECIPE':
            return referencedGeometry$(aoi, 'RECIPE_REF')
        case 'POLYGON':
            return of(polygon(aoi))
        case 'POINT':
            return of(point(aoi))
        case 'EE_TABLE':
            return of(eeTable(aoi).geometry())
        case 'GEOMETRY':
            return aoi.geometry === undefined || aoi.geometry === null
                ? throwError(() => new Error('A GEOMETRY aoi requires a geometry.'))
                : of(aoi.geometry)
        case 'ASSET_BOUNDS':
            return throwError(() => new Error(assetBoundsMessage))
        default:
            return throwError(() => new Error(`Unsupported aoi type: ${aoi.type}`))
    }
}

const referencedGeometry$ = (aoi, referenceType) =>
    typeof aoi.id === 'string' && aoi.id.trim()
        ? imageFactory({type: referenceType, id: aoi.id}).getGeometry$()
        : throwError(() => new Error(`${aoi.type} AOI requires a non-blank string ID.`))

// ASSET_BOUNDS means "whatever the source image covers", which is only knowable to a caller holding that
// image. Those callers branch on it themselves before asking; anyone else gets this instead of a
// descriptor or a silent null.
const assetBoundsMessage =
    'An ASSET_BOUNDS aoi cannot be resolved without source-image context; its owner must supply the bounds.'

// The only exported feature-collection authority. An EE_TABLE stays the table itself, so key filtering and
// buffering survive; everything else becomes a single feature around its resolved geometry.
const toFeatureCollection$ = aoi => {
    if (aoi === null || aoi === undefined) {
        return throwError(() => new Error('An AOI is required to create a feature collection.'))
    }
    return aoi.type === 'EE_TABLE'
        ? of(eeTable(aoi))
        : toGeometry$(aoi).pipe(
            map(geometry => ee.FeatureCollection([ee.Feature(geometry)]))
        )
}

const polygon = ({path}) =>
    ee.Geometry({geoJson: ee.Geometry.Polygon({coords: [path]}), geodesic: false})

const point = ({lat, lng}) =>
    ee.Geometry({geoJson: ee.Geometry.Point([lng, lat])})

const eeTable = ({id, keyColumn, key, buffer}) => {
    const getTable = () => {
        const table = ee.FeatureCollection(id)
        if (keyColumn) {
            return table
                .limit(table.size())
                .filter(propertyEqualityFilter(keyColumn, key))
        } else {
            return table
        }
    }
    const table = getTable()
    return buffer
        ? table.map(feature => feature.buffer(ee.Number(buffer).multiply(1000)))
        : table
}

export {geometryAoi, toFeatureCollection$, toGeometry$}
