import {allocationReviewState, REVIEWED} from '#sepal/recipe/samplingDesign/allocationReview'

import {derivedAllocation} from './sampling/allocationOutcome'

// What Sampling Design's panels derive locally (derivedResult.js): the sample allocation - its counts, the total they add
// up to and the uncertainty shown with them - which a person approves by applying it. The Allocation panel derives it in
// its draft from the design as the edit would leave it, whenever the inputs it reads are not those it was reviewed for
// (#sepal/recipe/samplingDesign/allocationReview), and Apply saves it with that record. Nothing is asked of Earth Engine.

export const SAMPLE_ALLOCATION_DERIVATION = 'sampleAllocation'

export const samplingDesignDerivations = [
    {
        id: SAMPLE_ALLOCATION_DERIVATION,
        panel: 'sampleAllocation',
        current: model => allocationReviewState(model) === REVIEWED,
        derive: derivedAllocation
    }
]
