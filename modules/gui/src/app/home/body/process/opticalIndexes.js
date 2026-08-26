import _ from 'lodash'

// Raw bands each index needs, transitively: ibi is derived from ndbi/savi/mndwi, so it lists their
// bands rather than those names. Keep an entry for every index in lib/js/ee/src/optical/indexes.js —
// one that is missing here is silently unavailable everywhere.
const requiredBandsByIndex = {
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
    nbi: ['red', 'nir', 'swir1'],
    ebbi: ['nir', 'swir1', 'swir2', 'thermal'],
    bui: ['red', 'swir1', 'swir2'],
    kndvi: ['red', 'nir']
}

export const getAvailableIndexes = availableBands =>
    Object.keys(requiredBandsByIndex).filter(index =>
        _.every(requiredBandsByIndex[index], requiredBand =>
            availableBands && availableBands.includes(requiredBand)
        )
    )
