import {RADAR_MEASURES} from '#sepal/recipe/radar/collectionMeasures'
import {msg} from '~/translate'

import {radarBandPresentation} from './bands'

export const isRadarDataSet = dataSetId => !!dataSetById[dataSetId]

// Which of them can be chosen for a recipe's dates is the shared policy's (dataSetOptions, ~/sources.js).
export const getDataSetOptions = () =>
    Object.keys(dataSetById)
        .map(dataSetId => ({
            value: dataSetId,
            label: msg(['sources.dataSets', dataSetId, 'label']),
            tooltip: msg(['sources.dataSets', dataSetId, 'tooltip'])
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

const dataSetById = {
    SENTINEL_1: {
        quality: 1,
        scale: 10,
        name: 'Sentinel 1',
        shortName: 'S1'
    }
}
