import {BAYTS_ALERTS_PROCESSING} from '#sepal/recipe/requirement/baytsAlertsProcessing'
import {PRIMARY_IMAGE, RADAR_OBSERVATION} from '#sepal/recipe/type/baytsAlerts'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {readSourceRequirements, SUPPORTED} from '../sourceRequirements'
import {HISTORICAL_STATS, MONITORABLE_STATISTICS, MONITORED_PASSES} from './historicalStatistics'

// What BAYTS Alerts needs of the historical statistics it monitors against, selected in REF, by what reads them. The
// alerts and their Retrieve read the statistics of each orbit pass they monitor (lib/js/ee/src/bayts/bayts.js), and no
// other. A reference with no pass they can read is refused in REF; one holding passes other than those monitored is
// accepted, and the passes chosen in PRC are what then needs changing. The alerts, and the first and last radar
// observations a layer can show, are built with the processing the statistics were built with (processingSettings.js):
// they wait while it is read, and are held where it cannot be read. Those radar observations read the reference's
// geometry, and an asset's mask, but none of its statistics.

// REF says what it finds on the input the reference is selected in. PRC says it on the passes monitored, which keep a
// pass the reference no longer supports, so that it can be deselected.
const REFERENCE = {
    id: 'reference',
    label: 'process.baytsAlerts.panel.reference.button',
    input: ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'
}
const PROCESSING = {id: 'options', label: 'process.baytsAlerts.panel.preprocess.button', input: () => 'orbits'}

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
    },
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: {
            ...BAYTS_ALERTS_PROCESSING,
            capability: {...HISTORICAL_STATS, factsOf: observed => observed?.processing},
            describe: () => ({message: msg('process.baytsAlerts.processing.unreadable'), details: []})
        },
        parameters: recipe => ({model: recipe.model}),
        operations: [IMAGE_OUTPUT, RADAR_OBSERVATION]
    }
]

// The passes REF establishes the reference supports, as the requirement judging it found them usable: null while that
// is not established - the reference being checked, unreadable or refused.
export const supportedPassesOf = ({state, recipe, evidenceOwnerOf, now}) => {
    const read = readSourceRequirements({state, recipe, evidenceOwnerOf, now})
        .find(({declaration}) => declaration.requirement === MONITORABLE_STATISTICS)
    return read?.verdict.status === SUPPORTED ? read.verdict.passes : null
}
