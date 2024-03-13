import {msg} from '~/translate'
import moment from 'moment'

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
                'VV_const', 'VV_t', 'VV_phase', 'VV_amp', 'VV_res',
                'VH_const', 'VH_t', 'VH_phase', 'VH_amp', 'VH_res'
            ]
        }
    }
}
