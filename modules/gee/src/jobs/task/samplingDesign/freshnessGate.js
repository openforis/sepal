import {defer, forkJoin, map, of} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {CURRENT, STALE, UNKNOWN, UNVERSIONED} from '#sepal/recipe/calculation/freshness'
import {allocationReviewState, INPUTS_CHANGED, REVIEWED, UNREVIEWED, UNTRUSTED} from '#sepal/recipe/samplingDesign/allocationReview'
import {strataFreshness, STRATUM_FRAME, stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'
import {
    admittedProportionsFrameFreshness,
    PROBABILITY_SOURCE,
    probabilitySourceQuestion,
    proportionsFreshness
} from '#sepal/recipe/samplingDesign/stratumProbabilities'

import {dependencyEvidence$} from '../../dependencyEvidence.js'

// Whether the design a stage is about to sample is still the one its areas and automatic proportions were calculated
// for, judged from what this request reads now - through the same RecipeScope the stage then builds its image and
// region from - never from what the browser asserted. Each stage is a request of its own and reads its inputs again,
// so each one is checked before anything else is exported.
//
// Admission judges the proportions by everything they were calculated from, and the allocation by what it was reviewed
// for (#sepal/recipe/samplingDesign/allocationReview): a new task samples only counts someone approved for the design as
// it is. A later stage reads the AOI or the stratification again, never the probability source, and samples the
// allocation it was submitted with, so it judges the frame alone: the areas', and the one the proportions were admitted
// with.
export const freshnessGate$ = (recipe, {admission}) => defer(() =>
    currentEvidence$(recipe.model, {admission}).pipe(
        map(current => {
            const areas = strataFreshness(recipe.model, current[STRATUM_FRAME])
            if (areas !== CURRENT) {
                throw freshnessError('stratification', areas)
            }
            const proportions = admission
                ? proportionsFreshness(recipe.model, current)
                : admittedProportionsFrameFreshness(recipe.model, current[STRATUM_FRAME])
            if (proportions !== CURRENT) {
                throw freshnessError('proportions', proportions)
            }
            const review = admission ? allocationReviewState(recipe.model) : REVIEWED
            if (review !== REVIEWED) {
                throw reviewError(review)
            }
            return current
        })
    )
)

const currentEvidence$ = (model, {admission}) => {
    const probabilitySource = admission ? probabilitySourceQuestion(model) : null
    return forkJoin({
        [STRATUM_FRAME]: dependencyEvidence$(STRATUM_FRAME, stratumFrameQuestion(model)),
        [PROBABILITY_SOURCE]: probabilitySource ? dependencyEvidence$(PROBABILITY_SOURCE, probabilitySource) : of(null)
    })
}

const REMEDIES = {
    [STALE]: 'Its inputs changed since it was calculated. Recalculate it.',
    [UNKNOWN]: 'It was saved without calculation evidence. Reload the page and recalculate it.',
    [UNVERSIONED]: 'A source it reads cannot report replacement. Select a source with supported replacement evidence.'
}

const REVIEW_MESSAGES = {
    [UNREVIEWED]: 'The sample allocation was saved without a record of what it was reviewed for.',
    [UNTRUSTED]: 'The sample allocation was last applied by an earlier version of SEPAL.',
    [INPUTS_CHANGED]: 'The strata, proportions or settings the sample allocation reads changed since it was reviewed.'
}

const reviewError = state => new ClientException(`Sampling Design allocation is ${state}`, {
    userMessage: {
        message: `${REVIEW_MESSAGES[state]} Open the design, review Sample Allocation, apply it and retrieve again.`,
        key: `tasks.samplingDesign.allocationReview.${state}`
    },
    errorCode: `SAMPLING_DESIGN_ALLOCATION_${state}`
})

const freshnessError = (section, state) => new ClientException(`Sampling Design ${section} is ${state}`, {
    userMessage: {
        message: `The ${section} of this design is not current. ${REMEDIES[state]}`,
        key: `tasks.samplingDesign.freshness.${section}.${state}`
    },
    errorCode: `SAMPLING_DESIGN_${state}`
})
