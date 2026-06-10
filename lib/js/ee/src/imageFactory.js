import {createRequire} from 'module'

// Lazy, synchronous module loading (preserves the original require() semantics
// that defer loading and break circular dependencies). require(esm) returns a
// namespace whose .default holds these modules' single export.
const require = createRequire(import.meta.url)
const load = path => {
    const module = require(path)
    return module.default || module
}

const factory = {
    'MOSAIC': () => load('./optical/mosaic.js'),
    'RADAR_MOSAIC': () => load('./radar/mosaic.js'),
    'PLANET_MOSAIC': () => load('./planet/mosaic.js'),
    'TIME_SERIES': () => load('./timeSeries/timeSeries.js'),
    'CCDC': () => load('./timeSeries/ccdc.js'),
    'CCDC_SLICE': () => load('./timeSeries/ccdcSlice.js'),
    'CHANGE_ALERTS': () => load('./timeSeries/changeAlerts.js'),
    'BAYTS_HISTORICAL': () => load('./bayts/baytsHistorical.js'),
    'BAYTS_ALERTS': () => load('./bayts/baytsAlerts.js'),
    'CLASSIFICATION': () => load('./classification/classification.js'),
    'UNSUPERVISED_CLASSIFICATION': () => load('./unsupervisedClassification/unsupervisedClassification.js'),
    'REGRESSION': () => load('./regression/regression.js'),
    'CLASS_CHANGE': () => load('./classChange/classChange.js'),
    'INDEX_CHANGE': () => load('./indexChange/indexChange.js'),
    'STACK': () => load('./stack/stack.js'),
    'BAND_MATH': () => load('./bandMath/bandMath.js'),
    'REMAPPING': () => load('./remapping/remapping.js'),
    'PHENOLOGY': () => load('./timeSeries/phenology.js'),
    'MASKING': () => load('./masking.js'),
    'ASSET_MOSAIC': () => load('./asset/mosaic.js'),
    'RECIPE_REF': () => load('./recipeRef.js'),
    'ASSET': () => load('./asset.js')
}

const getImplementation = type => {
    if (!factory[type]) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    const implementation = factory[type]()
    return (...args) => implementation(...args)
}

export default (recipe, ...args) => getImplementation(recipe.type)(recipe, ...args)
