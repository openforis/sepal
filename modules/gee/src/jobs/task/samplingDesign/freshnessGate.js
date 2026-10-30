import {defer, map} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {CURRENT, STALE, UNKNOWN, UNVERSIONED} from '#sepal/recipe/calculation/freshness'
import {
    proportionsFrameFreshness,
    strataFreshness,
    STRATUM_FRAME,
    stratumFrameQuestion
} from '#sepal/recipe/samplingDesign/stratumFrame'

import {dependencyEvidence$} from '../../dependencyEvidence.js'

// Whether the design a stage is about to sample is still the one its areas and automatic proportions were calculated
// for, judged from what this request reads now - through the same RecipeScope the stage then builds its image and
// region from - never from what the browser asserted. Each stage is a request of its own and reads its inputs again,
// so each one is checked before anything else is exported.
export const freshnessGate$ = recipe => defer(() =>
    dependencyEvidence$(STRATUM_FRAME, stratumFrameQuestion(recipe.model)).pipe(
        map(current => {
            const areas = strataFreshness(recipe.model, current)
            if (areas !== CURRENT) {
                throw freshnessError('stratification', areas)
            }
            const proportions = proportionsFrameFreshness(recipe.model, current)
            if (proportions !== CURRENT) {
                throw freshnessError('proportions', proportions)
            }
            return current
        })
    )
)

const REMEDIES = {
    [STALE]: 'Its inputs changed since it was calculated. Recalculate it.',
    [UNKNOWN]: 'It was saved without calculation evidence. Reload the page and recalculate it.',
    [UNVERSIONED]: 'A source it reads cannot report replacement. Select a source with supported replacement evidence.'
}

const freshnessError = (section, state) => new ClientException(`Sampling Design ${section} is ${state}`, {
    userMessage: {
        message: `The ${section} of this design is not current. ${REMEDIES[state]}`,
        key: `tasks.samplingDesign.freshness.${section}.${state}`
    },
    errorCode: `SAMPLING_DESIGN_${state}`
})
