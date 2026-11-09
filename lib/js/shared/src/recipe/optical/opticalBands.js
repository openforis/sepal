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

// The bands each scene of an optical collection carries as a time series builds it (lib/js/ee/src/timeSeries/
// collection.js) - the bands its data sets share, tasseled cap where they hold its inputs and every index they can
// compute - asked of by name, scene by scene. Nothing is composited, so no composite's rule applies.
export const sceneBands = (dataSets, reflectance) => {
    const common = commonBands(_.uniq((dataSets || []).flatMap(toDataSets)), reflectance)
    const tasseledCap = TASSELED_CAP_INPUT_BANDS.every(band => common.includes(band)) ? TASSELED_CAP_BANDS : []
    return [...common, ...tasseledCap, ...getAvailableIndexes(common)]
}

export const getAvailableIndexes = availableBands =>
    Object.keys(REQUIRED_BANDS_BY_INDEX).filter(index =>
        REQUIRED_BANDS_BY_INDEX[index].every(band => (availableBands || []).includes(band))
    )

// Why the data sets chosen cannot compute `index` together, as commonBands intersects them: the bands the index table
// says it reads that some lack, as the corrections leave them, and those data sets, as chosen. Null where they can
// compute it, or `index` is no index. A data set the catalogue does not describe takes nothing from the intersection, and
// lacks nothing.
export const missingIndexInputs = (model, index) => {
    const reflectance = reflectanceOf(model)
    const lacks = (dataSet, band) => toDataSets(dataSet)
        .map(id => dataSetSpecs[reflectance]?.[id])
        .some(spec => spec && !Object.hasOwn(spec.bands, band))
    const dataSets = _.uniq(Object.values(model?.sources?.dataSets || {}).flat())
    const required = Object.hasOwn(REQUIRED_BANDS_BY_INDEX, index) ? REQUIRED_BANDS_BY_INDEX[index] : []
    const bands = required.filter(band => dataSets.some(dataSet => lacks(dataSet, band)))
    return bands.length
        ? {index, bands, dataSets: dataSets.filter(dataSet => bands.some(band => lacks(dataSet, band)))}
        : null
}

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
