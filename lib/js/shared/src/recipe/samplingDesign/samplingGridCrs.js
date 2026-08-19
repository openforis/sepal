// The curated sampling-grid coordinate systems, defined once for the GUI selector, the task boundary and the
// EE layer (`#sepal/recipe/samplingDesign/samplingGridCrs` resolves here from modules/gui, modules/task and
// modules/gee). The lattice assumes projected, metre-based coordinates, so this is a policy list compared by
// exact value - not an EPSG-only regex - and the copy/pastable candidate function stays projection-agnostic.
//
// Recipes store the stable option `id` (EPSG:6933 / EPSG:6931 / EPSG:6932). Earth Engine cannot parse the literal
// "EPSG:6933", so that id resolves to this tested WKT1 string, which EE accepts. Resolve at the EE boundary
// only: EE must never receive the literal "EPSG:6933", and the WKT must never reach user-facing text.
export const EASE_GRID_2_GLOBAL_WKT = 'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Cylindrical_Equal_Area"],PARAMETER["standard_parallel_1",30],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","6933"]]'

export const EASE_GRID_2_GLOBAL = 'EPSG:6933'
export const EASE_GRID_2_NORTH = 'EPSG:6931'
export const EASE_GRID_2_SOUTH = 'EPSG:6932'

// Every design defaults to EASE-Grid 2.0 Global.
export const DEFAULT_SAMPLING_GRID_CRS = EASE_GRID_2_GLOBAL

// `id` is the stable value stored in the recipe; `eeValue` is what Earth Engine is given; `name` is the concise
// option name used in error text, so a message never dumps the WKT.
export const SAMPLING_GRID_CRS_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: EASE_GRID_2_GLOBAL,
        eeValue: EASE_GRID_2_GLOBAL_WKT,
        name: 'EPSG:6933 - EASE-Grid 2.0 Global',
        labelKey: 'process.samplingDesign.crs.easeGrid2Global'
    }),
    // The polar variants are accepted by EE directly, so their eeValue is their EPSG id. Only 6933 needs WKT.
    Object.freeze({
        id: EASE_GRID_2_NORTH,
        eeValue: EASE_GRID_2_NORTH,
        name: 'EPSG:6931 - EASE-Grid 2.0 North',
        labelKey: 'process.samplingDesign.crs.easeGrid2North'
    }),
    Object.freeze({
        id: EASE_GRID_2_SOUTH,
        eeValue: EASE_GRID_2_SOUTH,
        name: 'EPSG:6932 - EASE-Grid 2.0 South',
        labelKey: 'process.samplingDesign.crs.easeGrid2South'
    })
])

// An unset CRS is an absent configuration, so it resolves to the default.
const definitionOf = crs =>
    SAMPLING_GRID_CRS_DEFINITIONS.find(({id}) => id === (crs == null || crs === '' ? DEFAULT_SAMPLING_GRID_CRS : crs))

export const isSupportedSamplingGridCrs = crs => !!definitionOf(crs)

// The Earth Engine CRS string for a stored option id. Call this at the EE boundary only. Fails closed: an
// unsupported value must never fall through to EE (where it would silently pick up an image projection).
// Task routes return their structured validation error before reaching this.
export const resolveSamplingGridCrs = crs => {
    const definition = definitionOf(crs)
    if (!definition) {
        throw new Error(`Unsupported sampling grid CRS: ${crs}. Supported: ${supportedSamplingGridCrsNames().join(', ')}`)
    }
    return definition.eeValue
}

// Concise option names for error text - never the WKT.
export const supportedSamplingGridCrsNames = () =>
    SAMPLING_GRID_CRS_DEFINITIONS.map(({name}) => name)

// Turn a CONFIGURED grid (storing an option id) into an EE-ready grid. Call this at the EE boundary, after the
// configured grid has been validated: EE must never receive the literal "EPSG:6933". `crs` becomes the EE value
// used for generation; `crsId` keeps the configured id, which is what reproduction metadata and logs record -
// the WKT must never leak into row properties, metadata, CSV output, logs or user-facing text. Every other grid
// field - crsTransform, scale - is carried through unchanged.
export const resolveSamplingGrid = ({crs, ...grid} = {}) =>
    ({...grid, crs: resolveSamplingGridCrs(crs), crsId: configuredSamplingGridCrs(crs)})

// The configured option id, with an absent value resolved to the default.
export const configuredSamplingGridCrs = crs => definitionOf(crs)?.id

// ---------- Stratification CRS ----------
//
// Stratification interprets the categorical source, so it is NOT restricted to the curated Arrangement list: it
// must accept whatever projected CRS the source is meant to be read in. Only EPSG:6933 needs translating, for
// the same reason as above - Earth Engine cannot parse that literal.

export const isValidStratificationCrs = crs =>
    typeof crs === 'string' && crs.trim() !== ''

// Fails closed on blank: an unset Stratification CRS must never fall through to EE, where it would silently
// pick up the image projection. Validation reports the blank first; this is the boundary backstop.
export const resolveStratificationCrs = crs => {
    if (!isValidStratificationCrs(crs)) {
        return throwBlankStratificationCrs()
    }
    return crs === EASE_GRID_2_GLOBAL ? EASE_GRID_2_GLOBAL_WKT : crs
}

const throwBlankStratificationCrs = () => {
    throw new Error('Stratification CRS is required. Provide the projected CRS the categorical source is interpreted in.')
}

// Turn a CONFIGURED Stratification grid into an EE-ready grid. `crs` becomes the EE value; `crsId` keeps the
// configured value, which is what reproduction metadata and logs record - the WKT must never leak into row
// properties, metadata, CSV output, logs or user-facing text.
export const resolveStratificationGrid = ({crs, ...grid} = {}) =>
    ({...grid, crs: resolveStratificationCrs(crs), crsId: crs})
