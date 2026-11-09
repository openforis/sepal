import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'

import {segmentDescription} from '../sources/segmentEvidence'

// What Change Alerts presents of the segments it monitors against, read from the reference it selects
// (segmentEvidence.js).

// Whether there is a description to present at all. An operation over a source nothing can be said about
// is not offered, however much configuration the recipe carries.
export const hasSegmentDescription = recipe =>
    !!segmentDescription(recipe, PRIMARY_IMAGE).description

export const segmentBandsOf = recipe =>
    segmentDescription(recipe, PRIMARY_IMAGE).description?.bands || []

export const segmentVisualizations = recipe =>
    segmentDescription(recipe, PRIMARY_IMAGE).description?.visualizations || []

// The measures a segment description was fitted for with an RMSE, as monitoring evaluates them: what a reference can be
// monitored by.
export const fittedMeasures = ({bands = [], baseBands = []} = {}) => {
    const withRmse = bands.filter(band => band.endsWith('_rmse')).map(band => band.slice(0, -'_rmse'.length))
    return baseBands.map(({name}) => name).filter(name => withRmse.includes(name))
}
