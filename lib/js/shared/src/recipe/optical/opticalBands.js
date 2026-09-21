import _ from 'lodash'

import dataSetSpecs from './dataSetSpecs.js'

// Which bands an optical mosaic can be asked for, derived from its persisted model. Execution, the band pickers
// and the MOSAIC output declaration all answer from here.

export const TASSELED_CAP_BANDS = ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth']

const MEDOID_DATE_BANDS = ['unixTimeDays', 'dayOfYear', 'daysFromTarget']

const DATE_BANDS = [...MEDOID_DATE_BANDS, 'targetDayCloseness']

const TASSELED_CAP_INPUT_BANDS = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']

// `qa` is a native bitmask the composite gives no meaning; the date bands survive compositing only under MEDOID.
export const selectableBands = model => {
    const dataSets = contributingDataSets(model)
    if (!dataSets.length) {
        return []
    }
    const common = commonBands(dataSets, reflectanceOf(model))
    const spectral = common.filter(band => !['qa', ...DATE_BANDS].includes(band))
    const tasseledCap = TASSELED_CAP_INPUT_BANDS.every(band => common.includes(band))
        ? TASSELED_CAP_BANDS
        : []
    const dates = model?.compositeOptions?.compose === 'MEDOID' ? MEDOID_DATE_BANDS : []
    return [...spectral, ...tasseledCap, ...getAvailableIndexes(common), ...dates]
}

export const commonBands = (dataSets, reflectance) => {
    const specs = (dataSets || []).map(dataSet => dataSetSpecs[reflectance]?.[dataSet]).filter(spec => spec)
    return specs.length
        ? [..._.intersection(...specs.map(spec => Object.keys(spec.bands))), ...DATE_BANDS]
        : [...DATE_BANDS]
}

export const getAvailableIndexes = availableBands =>
    Object.keys(REQUIRED_BANDS_BY_INDEX).filter(index =>
        REQUIRED_BANDS_BY_INDEX[index].every(band => (availableBands || []).includes(band))
    )

// Hand-picked scenes decide which data sets are composited, whatever the configured selection allows.
const contributingDataSets = model => {
    const allScenes = !model?.sceneSelectionOptions || model.sceneSelectionOptions.type === 'ALL'
    return allScenes
        ? _.uniq(Object.values(model?.sources?.dataSets || {}).flat().flatMap(toDataSets))
        : _.uniq(Object.values(model?.scenes || {}).flat().flatMap(scene => toDataSets(scene.dataSet)))
}

const toDataSets = dataSet => ALIASES[dataSet] || [dataSet]

const ALIASES = {
    LANDSAT_TM: ['LANDSAT_4', 'LANDSAT_5'],
    LANDSAT_TM_T2: ['LANDSAT_4_T2', 'LANDSAT_5_T2']
}

const reflectanceOf = model =>
    (model?.compositeOptions?.corrections || []).includes('SR') ? 'SR' : 'TOA'

// Required raw bands, transitively: ibi is computed from ndbi, savi and mndwi, so it lists their bands.
export const REQUIRED_BANDS_BY_INDEX = {
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
