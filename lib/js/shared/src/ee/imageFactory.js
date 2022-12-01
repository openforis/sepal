const factory = {
    'MOSAIC': () => require('./optical/mosaic'),
    'RADAR_MOSAIC': () => require('./radar/mosaic'),
    'PLANET_MOSAIC': () => require('./planet/mosaic'),
    'TIME_SERIES': () => require('./timeSeries/timeSeries'),
    'CCDC': () => require('./timeSeries/ccdc'),
    'CCDC_SLICE': () => require('./timeSeries/ccdcSlice'),
    'CHANGE_ALERTS': () => require('./timeSeries/changeAlerts'),
    'CLASSIFICATION': () => require('./classification/classification'),
    'CLASS_CHANGE': () => require('./classChange/classChange'),
    'INDEX_CHANGE': () => require('./indexChange/indexChange'),
    'REMAPPING': () => require('./remapping/remapping'),
    'PHENOLOGY': () => require('./timeSeries/phenology'),
    'MASKING': () => require('./masking'),
    'RECIPE_REF': () => require('./recipeRef'),
    'ASSET': () => require('./asset')
}

const getImplementation = type => {
    if (!factory[type]) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    const implementation = factory[type]()
    return (...args) => implementation(...args)
}

module.exports = (recipe, ...args) => getImplementation(recipe.type)(recipe, ...args)
