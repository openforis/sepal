import {getDataSetBands} from './sources'

export const getIndexes = recipe =>
    getIndexesForBands(getDataSetBands(recipe))

export const getIndexesForBands = bands =>
    Object.keys(requiredBandsByOpticalIndex).filter(opticalIndex =>
        requiredBandsByOpticalIndex[opticalIndex].every(requiredBand => bands.includes(requiredBand))
    )

const requiredBandsByOpticalIndex = {
    ndvi: ['red', 'nir'],
    ndmi: ['nir', 'swir1'],
    ndwi: ['green', 'nir'],
    mndwi: ['green', 'swir1'],
    ndfi: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
    evi: ['blue', 'red', 'nir'],
    evi2: ['red', 'nir'],
    savi: ['red', 'nir'],
    nbr: ['nir', 'swir2'],
    mvi: ['green', 'nir', 'swir1'],
    ui: ['nir', 'swir2'],
    ndbi: ['nir', 'swir1'],
    ibi: ['green', 'red', 'nir', 'swir1'],
    bui: ['red', 'swir1', 'swir2'],
    kndvi: ['red', 'nir']

}
