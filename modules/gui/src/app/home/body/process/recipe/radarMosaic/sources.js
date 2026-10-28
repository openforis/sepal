import moment from 'moment'

import {RADAR_MEASURES} from '#sepal/recipe/radar/collectionMeasures'
import {msg} from '~/translate'

import {radarBandPresentation} from './bands'

export const isRadarDataSet = dataSetId => !!dataSetById[dataSetId]

export const getDataSetOptions = ({startDate, endDate}) =>
    Object.keys(dataSetById)
        .map(dataSetId => ({
            value: dataSetId,
            label: msg(['sources.dataSets', dataSetId, 'label']),
            tooltip: msg(['sources.dataSets', dataSetId, 'tooltip']),
            neverSelected: !isDataSetInDateRange(dataSetId, startDate, endDate)
        }))

export const toSources = dataSetIds =>
    dataSetIds.includes('SENTINEL_1')
        ? {SENTINEL_1: ['SENTINEL_1']}
        : {}

// The measures a Sentinel-1 collection offers, grouped for a picker: the polarisations and their ratio, then the orbit.
export const groupedMeasureOptions = () =>
    [
        RADAR_MEASURES.filter(measure => measure !== 'orbit'),
        RADAR_MEASURES.filter(measure => measure === 'orbit')
    ].map(group => group.map(measure => ({value: measure, label: measure, ...radarBandPresentation(measure)})))

export const isDataSetInDateRange = (dataSetId, fromDate, toDate) => {
    const dataSet = dataSetById[dataSetId]
    const startOk = !dataSet.toYear || moment(fromDate).year() <= dataSet.toYear
    const endOk = moment(toDate).subtract(1, 'days').year() >= dataSet.fromYear
    return startOk && endOk
}

const dataSetById = {
    SENTINEL_1: {
        fromYear: 2015,
        quality: 1,
        scale: 10,
        name: 'Sentinel 1',
        shortName: 'S1'
    }
}
