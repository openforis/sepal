import _ from 'lodash'

import dataSetSpecs from '../optical/dataSetSpecs.js'
import {TEMPORAL_PLANET_BANDS} from '../planet/planetBands.js'
import {RADAR_MEASURES} from '../radar/collectionMeasures.js'
import {ccdcMeasures} from '../type/ccdc.js'

export const MONITORING_TYPES = ['OPTICAL', 'RADAR', 'PLANET']

// Monitoring uses native measures only; a legacy copied Classification contributes nothing.
export const observedMeasures = ({sources = {}, options = {}} = {}) => {
    const dataSets = Object.values(sources.dataSets || {}).flat()
    if (!dataSets.length) return null
    if (sources.dataSets.LANDSAT || sources.dataSets.SENTINEL_2) {
        return ccdcMeasures({model: {sources, options}})
    }
    return dataSets.includes('SENTINEL_1') ? RADAR_MEASURES : TEMPORAL_PLANET_BANDS.flat()
}

// Reuse the existing memoized family scope, independent of a particular date-filtered picker.
const measuresOfType = _.memoize(type => type === 'OPTICAL'
    ? _.uniq(Object.keys(dataSetSpecs.TOA).flatMap(dataSet => [[], ['SR']].flatMap(corrections =>
        observedMeasures({sources: {dataSets: {LANDSAT: [dataSet]}}, options: {corrections}}))))
    : type === 'RADAR' ? RADAR_MEASURES : type === 'PLANET' ? TEMPORAL_PLANET_BANDS.flat() : [])

export const availableMeasures = type => type ? measuresOfType(type) : null
export const monitorableMeasures = () => _.uniq(MONITORING_TYPES.flatMap(measuresOfType))

export const monitoringParameters = model => ({
    measure: model.sources?.band || null,
    available: availableMeasures(model.sources?.dataSetType),
    observed: observedMeasures(model)
})
