import {PRIMARY_IMAGE} from '#sepal/recipe/type/baytsAlerts'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {readSourceRequirements, SUPPORTED} from '../sourceRequirements'
import {MONITORABLE_STATISTICS, MONITORED_PASSES} from './historicalStatistics'

// What BAYTS Alerts needs of the historical statistics it monitors against, selected in REF, by what reads them. The
// alerts and their Retrieve read the statistics of each orbit pass they monitor (lib/js/ee/src/bayts/bayts.js), and no
// other. A reference with no pass they can read is refused in REF; one holding passes other than those monitored is
// accepted, and the passes chosen in PRC are what then needs changing - unless the reference describes the processing
// it was built with, which is applied to PRC once it is (referenceObservation.js). The first and last radar observations
// a layer can show read the reference's geometry, and an asset's mask, but none of its statistics.

// REF says what it finds on the input the reference is selected in. PRC's choice of passes cannot show it, so its
// toolbar button does.
const REFERENCE = {
    id: 'reference',
    label: 'process.baytsAlerts.panel.reference.button',
    input: ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'
}
const PROCESSING = {id: 'options', label: 'process.baytsAlerts.panel.preprocess.button'}

// Monitored where none are stated, as execution does.
const DEFAULT_ORBITS = ['ASCENDING', 'DESCENDING']

export const baytsAlertsRequirements = [
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: MONITORABLE_STATISTICS,
        operations: [IMAGE_OUTPUT]
    },
    {
        role: PRIMARY_IMAGE,
        section: PROCESSING,
        requirement: MONITORED_PASSES,
        parameters: ({model}) => ({orbits: model.options?.orbits || DEFAULT_ORBITS}),
        operations: [IMAGE_OUTPUT],
        advise: [REFERENCE.id]
    }
]

// The passes REF establishes the reference supports, as the requirement judging it found them usable: null while that
// is not established - the reference being checked, unreadable or refused.
export const supportedPassesOf = ({state, recipe, evidenceOwnerOf, now}) => {
    const read = readSourceRequirements({state, recipe, evidenceOwnerOf, now})
        .find(({declaration}) => declaration.requirement === MONITORABLE_STATISTICS)
    return read?.verdict.status === SUPPORTED ? read.verdict.passes : null
}
