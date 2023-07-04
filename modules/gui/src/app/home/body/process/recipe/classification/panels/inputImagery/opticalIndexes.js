import _ from 'lodash'

const indexByName = {
    ndvi: {
        requiredBands: ['red', 'nir']
    },
    ndmi: {
        requiredBands: ['nir', 'swir1']
    },
    ndwi: {
        requiredBands: ['green', 'nir']
    },
    mndwi: {
        requiredBands: ['green', 'swir1']
    },
    ndfi: {
        requiredBands: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    },
    evi: {
        requiredBands: ['blue', 'red', 'nir']
    },
    evi2: {
        requiredBands: ['red', 'nir']
    },
    savi: {
        requiredBands: ['red', 'nir']
    },
    nbr: {
        requiredBands: ['nir', 'swir2']
    },
    mvi: {
        requiredBands: ['green', 'nir', 'swir1']
    },
    ui: {
        requiredBands: ['nir', 'swir2']
    },
    ndbi: {
        requiredBands: ['nir', 'swir1']
    },
    ibi: {
        requiredBands: ['green', 'red', 'nir', 'swir1']
    },
    nbi: {
        requiredBands: ['red', 'nir', 'swir1']
    },
    ebbi: {
        requiredBands: ['nir', 'swir1', 'swir2', 'thermal']
    },
    bui: {
        requiredBands: ['red', 'swir1', 'swir2']
    },
    kndvi: {
        requiredBands: ['red', 'nir']
    }
}

const indexNames = [
    'ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui'
]

export const getAvailableIndexes = availableBands =>
    indexNames.filter(name => _.every(
        indexByName[name].requiredBands,
        requiredBand => availableBands && availableBands.includes(requiredBand)
    ))
