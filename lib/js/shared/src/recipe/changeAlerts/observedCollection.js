// The collection a Change Alerts recipe observes at a pixel, as its chart reads it (/timeSeries/loadObservations):
// the consumer's Sources and effective options over its calibration and monitoring periods, built as a Time Series
// builds its own (lib/js/ee/src/timeSeries/collection.js). The caller resolves reference processing first, then judges
// this projection by the Time Series declarations, separately authorizing the live reference's computation through
// shared readiness. This projection does not execute segments or train. A legacy Classification copy in Sources is
// no part of it.
//
// Pure, as mosaicRecipe.js is: the recipe keeps the Change Alerts recipe's id, so what is found is said of it.

import {monitoringDates} from './monitoringDates.js'

export const observedCollection = ({id, model}) => {
    const {calibrationStart, monitoringEnd} = monitoringDates(model)
    const {classification: _classification, ...sources} = model.sources || {}
    return {
        id,
        type: 'TIME_SERIES',
        model: {
            dates: {startDate: calibrationStart, endDate: monitoringEnd},
            sources,
            options: model.options
        }
    }
}
