import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'

import {segmentDescription} from '../segmentEvidence'

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
