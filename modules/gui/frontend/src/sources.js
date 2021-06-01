import {msg} from './translate'
import {supportProbability, supportRegression} from './app/home/body/process/recipe/classification/classificationRecipe'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'

export const imageSourceById = {
    LANDSAT: {
        dataSets: [
            'LANDSAT_8',
            'LANDSAT_7',
            'LANDSAT_TM',
            'LANDSAT_8_T2',
            'LANDSAT_7_T2',
            'LANDSAT_TM_T2'
        ]
    },
    SENTINEL_2: {
        dataSets: [
            'SENTINEL_2'
        ]
    },
    SENTINEL_1: {
        dataSets: [
            'SENTINEL_1'
        ]
    }
}

export const getDataSet = dataSetId => {
    const {scale, name, shortName} = dataSetById[dataSetId]
    return {scale, name, shortName}
}

export const isDataSetInDateRange = (dataSetId, fromDate, toDate) => {
    const dataSet = dataSetById[dataSetId]
    const startOk = !dataSet.toYear || moment(fromDate).year() <= dataSet.toYear
    const endOk = moment(toDate).subtract(1, 'days').year() >= dataSet.fromYear
    return startOk && endOk
}

export const minScale = sources => {
    const dataSetIds = Object.values(sources).flat()
    return Math.min(...dataSetIds.map(dataSetId => getDataSet(dataSetId).scale))
}

export const groupedDataSetOptions = ({dataSetIds, startDate, endDate}) => {
    const radarDisabled = dataSetIds && dataSetIds.find(dataSetId => isOptical(dataSetId))
    const opticalDisabled = dataSetIds && dataSetIds.find(dataSetId => !isOptical(dataSetId))

    const toDataSetOption = ({dataSetId, isOptical}) => ({
        value: dataSetId,
        label: msg(['sources.dataSets', dataSetId, 'label']),
        tooltip: msg(['sources.dataSets', dataSetId, 'tooltip']),
        neverSelected: !!(
            !isDataSetInDateRange(dataSetId, startDate, endDate)
            || (isOptical && opticalDisabled)
            || (!isOptical && radarDisabled)
        )
    })
    const opticalOptions = opticalSourceIds
        .map(sourceId => imageSourceById[sourceId].dataSets)
        .flat()
        .map(dataSetId => toDataSetOption({dataSetId, isOptical: true}))

    const radarOptions = radarSourceIds
        .map(sourceId => imageSourceById[sourceId].dataSets)
        .flat()
        .map(dataSetId => toDataSetOption({dataSetId, isOptical: false}))

    return [
        {label: msg('sources.optical.label'), disabled: opticalDisabled, options: opticalOptions},
        {label: msg('sources.radar.label'), disabled: radarDisabled, options: radarOptions}
    ]
}

export const toSources = dataSetIds => {
    const sources = {}
    Object.keys(imageSourceById)
        .forEach(sourceId => {
            const dataSets = _.intersection(imageSourceById[sourceId].dataSets, dataSetIds)
            if (dataSets.length) {
                sources[sourceId] = dataSets
            }
        })
    return sources
}

export const getAvailableBands = ({
    dataSetId,
    sources = {},
    corrections,
    timeScan,
    classification: {
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {},
    order = ['indexes', 'dataSets', 'classification']
}) => {
    const dataSetIds = dataSetId
        ? [dataSetId]
        : Object.values(sources).flat()
    const correction = corrections && corrections.includes('SR') ? 'SR' : 'TOA'
    const bandsForEachDataSet = dataSetIds
        .map(dataSetId => getDataSetBands({dataSetId, correction, timeScan}))
    const classificationBands = getClassificationBands(classifierType, classificationLegend, include)
    const dataSetBands = _.intersection(...bandsForEachDataSet)
    const opticalIndexes = Object.keys(requiredBandsByOpticalIndex).filter(opticalIndex =>
        requiredBandsByOpticalIndex[opticalIndex].every(requiredBand => dataSetBands.includes(requiredBand))
    )
    return _.uniq(order.map(bandType => {
        switch (bandType) {
        case 'indexes':
            return opticalIndexes
        case 'dataSets':
            return dataSetBands
        case 'classification':
            return classificationBands
        default:
            throw new Error(`Unsupported band type: ${bandType}`)
        }
    }).flat())
}

export const groupedBandOptions = ({
    dataSetId,
    sources = {},
    corrections,
    timeScan,
    classification: {
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {},
    order = ['indexes', 'dataSets', 'classification']
}) => {
    const availableDataSetBands = getAvailableBands({
        dataSetId, sources, corrections, timeScan, order: ['dataSets']
    })
    const availableIndexes = getAvailableBands({
        dataSetId, sources, corrections, timeScan, order: ['indexes']
    })
    const indexOptions = availableIndexes.map(index => getBandOption(index))
    const dataSetOptions = groupedBands
        .map(({bands}) => bands
            .filter(band => availableDataSetBands.includes(band))
            .map(band => getBandOption(band))
            .filter(option => option)
        )
        .filter(group => group.length)
        .map(group => ({options: group}))
    const classificationOptions = getClassificationOptions(classifierType, classificationLegend, include)
    return order.map(bandType => {
        switch (bandType) {
        case 'indexes':
            return indexOptions.length ? [{options: indexOptions}] : []
        case 'dataSets':
            return dataSetOptions
        case 'classification':
            return classificationOptions.length ? [{options: classificationOptions}] : []
        default:
            throw new Error(`Unsupported band type: ${bandType}`)
        }
    }).flat()
}

export const flatBandOptions = ({
    dataSetId,
    sources = {},
    corrections,
    timeScan,
    classification: {
        classifierType,
        classificationLegend,
        include = ['class', 'regression', 'class_probability', 'probabilities']
    } = {},
    order = ['indexes', 'dataSets', 'classifications']
}) => {
    const availableDataSetBands = getAvailableBands({
        dataSetId, sources, corrections, timeScan, order: ['dataSets']
    })

    const availableIndexes = getAvailableBands({
        dataSetId, sources, corrections, timeScan, order: ['indexes']
    })
    const indexOptions = availableIndexes.map(index => getBandOption(index))
    const bandOptions = groupedBands
        .map(({bands}) => bands
            .filter(band => availableDataSetBands.includes(band))
            .map(band => getBandOption(band))
            .filter(option => option)
        )
        .flat()
    const classificationOptions = getClassificationOptions(classifierType, classificationLegend, include)
    return order.map(bandType => {
        switch (bandType) {
        case 'indexes':
            return indexOptions
        case 'dataSets':
            return bandOptions
        case 'classification':
            return classificationOptions
        default:
            throw new Error(`Unsupported band type: ${bandType}`)
        }
    }).flat()
}

function getClassificationBands(classifierType, classificationLegend, include) {
    return classifierType && classificationLegend
        ? [
            include.includes('class') ? ['class'] : [],
            include.includes('regression') && supportRegression(classifierType) ? ['regression'] : [],
            include.includes('class_probability') && supportProbability(classifierType) ? ['class_probability'] : [],
            include.includes('probabilities') && supportProbability(classifierType)
                ? classificationLegend.entries.map(({value}) => `probability_${value}`)
                : []
        ].flat()
        : []
}

function getClassificationOptions(classifierType, classificationLegend, include) {
    return classifierType && classificationLegend && classificationLegend.entries
        ? [
            include.includes('class')
                ? [{
                    mosaicMultiplier: 1,
                    timeSeriesMultiplier: 1,
                    value: 'class',
                    label: msg('process.classification.bands.class')
                }]
                : [],
            include.includes('regression') && supportRegression(classifierType)
                ? [{
                    mosaicMultiplier: 100,
                    timeSeriesMultiplier: 100,
                    value: 'regression',
                    label: msg('process.classification.bands.regression')
                }]
                : [],
            include.includes('class_probability') && supportProbability(classifierType)
                ? [{
                    mosaicMultiplier: 100,
                    timeSeriesMultiplier: 100,
                    value: 'class_probability',
                    label: msg('process.classification.bands.classProbability')
                }]
                : [],
            include.includes('probabilities') && supportProbability(classifierType)
                ? classificationLegend.entries.map(({value, label}) => ({
                    mosaicMultiplier: 100,
                    timeSeriesMultiplier: 100,
                    value: `probability_${value}`,
                    label: msg('process.classification.bands.probability', {class: label})
                }))
                : []
        ].flat()
        : []
}

const dataSetById = {
    LANDSAT_8: {
        fromYear: 2013,
        quality: 1,
        scale: 30,
        name: 'Landsat 8',
        shortName: 'L8',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'pan', 'cirrus', 'thermal', 'thermal2',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    LANDSAT_7: {
        fromYear: 1999,
        quality: 2,
        scale: 30,
        name: 'Landsat 7',
        shortName: 'L7',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'pan', 'thermal', 'thermal2',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    LANDSAT_TM: {
        fromYear: 1982,
        toYear: 2012,
        quality: 2,
        scale: 30,
        name: 'Landsat 4-5',
        shortName: 'L4-5',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    LANDSAT_8_T2: {
        fromYear: 2013,
        quality: 3,
        scale: 30,
        name: 'Landsat 8, tier 2',
        shortName: 'L8 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'aerosol', 'pan', 'cirrus', 'thermal', 'thermal2',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    LANDSAT_7_T2: {
        fromYear: 1999,
        quality: 3,
        scale: 30,
        name: 'Landsat 7, tier 2',
        shortName: 'L7 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'pan', 'thermal', 'thermal2',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    LANDSAT_TM_T2: {
        fromYear: 1984,
        toYear: 2012,
        quality: 3,
        scale: 30,
        name: 'Landsat 4-5, tier 2',
        shortName: 'L4-5 T2',
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'thermal',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    SENTINEL_2: {
        fromYear: 2015,
        quality: 1,
        scale: 10,
        name: 'Sentinel 2',
        shortName: 'S2',
        TOA: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'redEdge1', 'redEdge2', 'redEdge3', 'redEdge4',
                'aerosol', 'waterVapor', 'cirrus',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        },
        SR: {
            bands: [
                'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
                'redEdge1', 'redEdge2', 'redEdge3', 'redEdge4',
                'aerosol', 'waterVapor',
                'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'
            ]
        }
    },
    SENTINEL_1: {
        fromYear: 2015,
        quality: 1,
        scale: 10,
        name: 'Sentinel 1',
        shortName: 'S1',
        pointInTime: {
            bands: [
                'VV', 'VH', 'ratio_VV_VH'
            ]
        },
        timeScan: {
            bands: [
                'VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv',
                'VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv',
                'VV_const', 'VVt', 'VV_phase', 'VV_amp', 'VV_res',
                'VH_const', 'VHt', 'VH_phase', 'VH_amp', 'VH_res'
            ]
        }
    }
}

const option = band => ({value: band, label: msg(['bands', band])})

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
    ui: ['nir', 'swir2'],
    ndbi: ['nir', 'swir1'],
    ibi: ['green', 'red', 'nir', 'swir1'],
    bui: ['red', 'swir1', 'swir2']

}

let optionByBand = null
const getBandOption = band => {
    if (!optionByBand)
        optionByBand = {
            ndvi: {
                value: 'ndvi',
                label: 'NDVI',
                tooltip: '(nir - red) / (nir + red)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ndmi: {
                value: 'ndmi',
                label: 'NDMI',
                tooltip: '(nir - swir1) / (nir + swir1)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ndwi: {
                value: 'ndwi',
                label: 'NDWI',
                tooltip: '(green - nir) / (green + nir)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            mndwi: {
                value: 'mndwi',
                label: 'MNDWI',
                tooltip: '(green - swir1) / (green + swir1)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ndfi: {
                value: 'ndfi',
                label: 'NDFI',
                tooltip: 'Normalized Difference Fraction Index',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            evi: {
                value: 'evi',
                label: 'EVI',
                tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            evi2: {
                value: 'evi2',
                label: 'EVI2',
                tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            savi: {
                value: 'savi',
                label: 'SAVI',
                tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            nbr: {
                value: 'nbr',
                label: 'NBR',
                tooltip: '(nir - swir2) / (nir + swir2)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ui: {
                value: 'ui',
                label: 'UI',
                tooltip: '(swir2 - nir) / (swir2 + nir)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ndbi: {
                value: 'ndbi',
                label: 'NDBI',
                tooltip: '(swir1 - nir) / (swir1 + nir)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            ibi: {
                value: 'ibi',
                label: 'IBI',
                tooltip: '(ndbi - (savi + mndwi) / 2) / (ndbi + (savi + mndwi) / 2)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            bui: {
                value: 'bui',
                label: 'BUI',
                tooltip: '(red - swir1) / (red + swir1) + (swir2 - swir1) / (swir2 + swir1)',
                mosaicMultiplier: 10000,
                timeSeriesMultiplier: 10000
            },
            blue: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('blue')},
            green: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('green')},
            red: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('red')},
            nir: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('nir')},
            swir1: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('swir1')},
            swir2: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('swir2')},
            redEdge1: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('redEdge1')},
            redEdge2: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('redEdge2')},
            redEdge3: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('redEdge3')},
            redEdge4: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('redEdge4')},
            aerosol: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('aerosol')},
            waterVapor: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('waterVapor')},
            pan: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('pan')},
            cirrus: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('cirrus')},
            thermal: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('thermal')},
            thermal2: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('thermal2')},
            brightness: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('brightness')},
            greenness: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('greenness')},
            wetness: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('wetness')},
            fourth: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('fourth')},
            fifth: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('fifth')},
            sixth: {mosaicMultiplier: 10000, timeSeriesMultiplier: 10000, ...option('sixth')},
            VV: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VV', label: 'VV'},
            VH: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VH', label: 'VH'},
            ratio_VV_VH: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'ratio_VV_VH', label: 'VV/VH'},
            VV_min: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VV_min', label: <span>VV<sub>min</sub></span>},
            VV_mean: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VV_mean', label: <span>VV<sub>mean</sub></span>},
            VV_med: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_med',
                label: <span>VV<sub>med</sub></span>
            },
            VV_max: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VV_max', label: <span>VV<sub>max</sub></span>},
            VV_std: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_std',
                label: <span>VV<sub>sd</sub></span>
            },
            VV_cv: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VV_cv', label: <span>VV<sub>cv</sub></span>},
            VH_min: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VH_min', label: <span>VH<sub>min</sub></span>},
            VH_mean: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VH_mean', label: <span>VH<sub>mean</sub></span>},
            VH_med: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_med',
                label: <span>VH<sub>med</sub></span>
            },
            VH_max: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VH_max', label: <span>VH<sub>max</sub></span>},
            VH_std: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_std',
                label: <span>VH<sub>sd</sub></span>
            },
            VH_cv: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VH_cv', label: <span>VH<sub>cv</sub></span>},
            VV_const: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_const',
                label: <span>VV<sub>const</sub></span>
            },
            VVt: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VVt', label: <span>VV<sub>t</sub></span>},
            VV_phase: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_phase',
                label: <span>VV<sub>phase</sub></span>
            },
            VV_amp: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_amp',
                label: <span>VV<sub>amp</sub></span>
            },
            VV_res: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VV_res',
                label: <span>VV<sub>residuals</sub></span>
            },
            VH_const: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_const',
                label: <span>VH<sub>const</sub></span>
            },
            VHt: {mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, value: 'VHt', label: <span>VH<sub>t</sub></span>},
            VH_phase: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_phase',
                label: <span>VH<sub>phase</sub></span>
            },
            VH_amp: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_amp',
                label: <span>VH<sub>amp</sub></span>
            },
            VH_res: {
                mosaicMultiplier: 1000,
                timeSeriesMultiplier: 1000,
                value: 'VH_res',
                label: <span>VH<sub>residuals</sub></span>
            }
        }
    return optionByBand[band]
}

const groupedBands = [
    {
        bands: ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalIndexes'
    },
    {
        bands: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalBands'
    },
    {
        bands: ['redEdge1', 'redEdge2', 'redEdge3', 'redEdge4'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalBands'
    },
    {
        bands: ['aerosol', 'waterVapor', 'pan', 'cirrus', 'thermal', 'thermal2'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalBands'
    },
    {
        bands: ['brightness', 'greenness', 'wetness'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalBands'
    },
    {
        bands: ['fourth', 'fifth', 'sixth'],
        mosaicMultiplier: 10000,
        timeSeriesMultiplier: 10000,
        type: 'opticalBands'
    },
    {bands: ['VV', 'VH', 'ratio_VV_VH'], mosaicMultiplier: 1000, timeSeriesMultiplier: 1000, type: 'radarBands'},
    {
        bands: ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv'],
        mosaicMultiplier: 1000,
        timeSeriesMultiplier: 1000,
        type: 'radarBands'
    },
    {
        bands: ['VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv'],
        mosaicMultiplier: 1000,
        timeSeriesMultiplier: 1000,
        type: 'radarBands'
    },
    {
        bands: ['VV_const', 'VVt', 'VV_phase', 'VV_amp', 'VV_res'],
        mosaicMultiplier: 1000,
        timeSeriesMultiplier: 1000,
        type: 'radarBands'
    },
    {
        bands: ['VH_const', 'VHt', 'VH_phase', 'VH_amp', 'VH_res'],
        mosaicMultiplier: 1000,
        timeSeriesMultiplier: 1000,
        type: 'radarBands'
    }
]

export const sources = ['LANDSAT', 'SENTINEL_2']

const radarSourceIds = ['SENTINEL_1']
const opticalSourceIds = ['LANDSAT', 'SENTINEL_2']

const isOptical = dataSetId =>
    dataSetId !== 'SENTINEL_1'

const getDataSetBands = ({dataSetId, correction, timeScan}) => {
    return isOptical(dataSetId)
        ? dataSetById[dataSetId][correction].bands
        : dataSetById[dataSetId][timeScan ? 'timeScan' : 'pointInTime'].bands
}
