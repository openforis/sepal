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
        requiredBands: ['nir', 'swir1', 'swir2']
    },
    bui: {
        requiredBands: ['red', 'swir1', 'swir2']
    }
}

const indexNames = [
    'ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui'
]

export const getAvailableIndexes = availableBands =>
    indexNames.filter(name => _.every(
        indexByName[name].requiredBands,
        requiredBand => availableBands.includes(requiredBand)
    ))
