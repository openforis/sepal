import {createRequire} from 'module'

import {ASSET, isReferenceId, RECIPE_REF} from '#sepal/recipe/source/reference'

import {currentPath, inPath, withPath} from './executionPath.js'

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
    'LANDTRENDR': () => load('./timeSeries/landTrendr.js'),
    'CHANGE_ALERTS': () => load('./timeSeries/changeAlerts.js'),
    'BAYTS_HISTORICAL': () => load('./bayts/baytsHistorical.js'),
    'BAYTS_ALERTS': () => load('./bayts/baytsAlerts.js'),
    'PYEO_ALERTS': () => load('./pyeo/pyeoAlerts.js'),
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
    'ASSET': () => load('./asset.js'),
    'SAMPLING_DESIGN': () => load('./samplingDesign/samplingDesign.js')
}

const getImplementation = type => {
    if (!factory[type]) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    const implementation = factory[type]()
    return (...args) => implementation(...args)
}

// The outermost concrete recipe names itself, so a reference back to it closes a cycle. Only when the path is
// still empty: once ancestry exists, advancing it is recipeRef's job, and a recipe materialized inside another
// one - the mosaic changeAlerts.js builds around its own dates, the single-orbit recipe baytsHistorical.js
// derives - is not a further persisted dependency.
//
// A reference is not a recipe here: RECIPE_REF gains its id when recipeRef loads it, and an ASSET id is never
// a recipe id at all.
const seeded = (recipe, path) =>
    path.length === 0 && recipe.type !== RECIPE_REF && recipe.type !== ASSET && isReferenceId(recipe.id)
        ? [recipe.id]
        : path

// Every accessor is re-entered in the ancestry captured when the factory was built, on call AND on subscribe.
// Implementations construct some children eagerly - masking.js builds both of its inputs while being
// constructed - and others inside Observable callbacks, so both phases have to carry it.
const inAncestry = (implementation, path) =>
    implementation && typeof implementation === 'object'
        ? Object.fromEntries(
            Object.entries(implementation).map(([name, value]) => [
                name,
                typeof value === 'function'
                    ? (...callArgs) => inPath(path, withPath(path, () => value.apply(implementation, callArgs)))
                    : value
            ])
        )
        : implementation

export default (recipe, ...args) => {
    const path = seeded(recipe, currentPath())
    return withPath(path, () => inAncestry(getImplementation(recipe.type)(recipe, ...args), path))
}
