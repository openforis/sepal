import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import _ from 'lodash'
import moment from 'moment'

export const sources = ['LANDSAT', 'SENTINEL_2']

export const isOpticalDataSet = dataSetId => !!dataSetById[dataSetId]

export const getDataSetBands = recipe => {
    const dataSets = selectFrom(recipe, 'model.sources.dataSets')
    const corrections = selectFrom(recipe, 'model.compositeOptions.corrections')
    const dataSetIds = Object.values(dataSets).flat()
    const correction = corrections && corrections.includes('SR') ? 'SR' : 'TOA'

    const bandsPerDataSet = dataSetIds.map(dataSetId => {
        return dataSetById[dataSetId]
            ? dataSetById[dataSetId][correction].bands
            : []
    })
    return _.uniq(_.intersection(...bandsPerDataSet))
}

export const toSources = dataSetIds => {
    const sources = {}
    Object.keys(imageSourceById)
        .forEach(sourceId => {
            const dataSets = _.intersection(
                imageSourceById[sourceId]
                    ? imageSourceById[sourceId].dataSets
                    : [],
                dataSetIds
            )
            if (dataSets.length) {
                sources[sourceId] = dataSets
            }
        })
    return sources
}

export const getDataSets = sourceId => {
    return imageSourceById[sourceId].dataSets
}

export const getDataSet = dataSetId => {
    const {scale, name, shortName} = dataSetById[dataSetId]
    return {scale, name, shortName}
}

export const getDataSetOptions = ({startDate, endDate}) =>
    Object.keys(dataSetById)
        .map(dataSetId => ({
            value: dataSetId,
            label: msg(['sources.dataSets', dataSetId, 'label']),
            tooltip: msg(['sources.dataSets', dataSetId, 'tooltip']),
            neverSelected: !isDataSetInDateRange(dataSetId, startDate, endDate)
        }))

export const isDataSetInDateRange = (dataSetId, fromDate, toDate) => {
    const dataSet = dataSetById[dataSetId]
    const startOk = !dataSet.toYear || moment(fromDate).year() <= dataSet.toYear
    const endOk = moment(toDate).subtract(1, 'days').year() >= dataSet.fromYear
    return startOk && endOk
}

export const minScale = recipe => {
    const dataSets = selectFrom(recipe, 'model.sources.dataSets') || {}
    return _(dataSets)
        .keys()
        .map(sourceId => imageSourceById[sourceId].dataSets)
        .flatten()
        .map(dataSet => dataSetById[dataSet].scale)
        .min()
}

const imageSourceById = {
    LANDSAT: {
        dataSets: [
            'LANDSAT_9',
            'LANDSAT_8',
            'LANDSAT_7',
            'LANDSAT_TM',
            'LANDSAT_9_T2',
            'LANDSAT_8_T2',
            'LANDSAT_7_T2',
            'LANDSAT_TM_T2'
        ]
    },
    SENTINEL_2: {
        dataSets: [
            'SENTINEL_2'
        ]
    }
}

const dataSetById = {
    LANDSAT_9: {
        fromYear: 2021,
        quality: 1,
        scale: 30,
        name: 'Landsat 9',
        shortName: 'L9',
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
    LANDSAT_9_T2: {
        fromYear: 2021,
        quality: 3,
        scale: 30,
        name: 'Landsat 9, tier 2',
        shortName: 'L9 T2',
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
    }
}
