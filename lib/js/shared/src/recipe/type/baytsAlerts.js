import {ALERT_BANDS} from '../bayts/alertBands.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromId, fromSelection} from '../source/extract.js'
import {assetReference} from '../source/reference.js'

// BAYTS alerts monitors a historical reference and carries its state forward
// (lib/js/ee/src/bayts/baytsAlerts.js):
//
//   model.reference                            the selected BAYTS historical source, recipe OR asset
//   baytsAlertsOptions.previousAlertsAsset      the alerts an earlier run produced, continued rather than
//                                               recomputed
//   baytsAlertsOptions.wetlandMaskAsset         where a low-confidence flag is resolved against wetland
//
// The two option fields are both Earth Engine assets and are persisted in DIFFERENT shapes by one writer
// (recipe/baytsAlerts/panels/options/options.jsx valuesToModel), so they need different extraction:
//
//   previousAlertsAsset is written as a canonical {type, id} selection, or undefined when cleared, and
//   baytsAlerts.js hands it straight to imageFactory. A selection written without an id is a broken
//   dependency and must say so.
//
//   wetlandMaskAsset is written as a bare id and read as ee.Image(wetlandMaskAsset || 0), so a blank one is
//   a constant image rather than a reference. Diagnosing it would invent a dependency with nothing to
//   resolve.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export const PREVIOUS_ALERTS = 'PREVIOUS_ALERTS'
export const WETLAND_MASK = 'WETLAND_MASK'

// The alerts: the bands the algorithm selects last, in that order, whether it starts from its own initial alerts or
// continues a previous run's, and whatever the layer's confidence filters mask. All are sampled at coarser pyramid
// levels, as Retrieve has always exported them: flags and orbits are categories, dates are dates no average of
// neighbours would hold, and the probabilities are kept as the pixels detected them. No encoding is declared. The
// first and last radar observations a layer can show instead are a separate product, not this output.
export const BAYTS_ALERT_BANDS = ALERT_BANDS
    .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

export default defineRecipeType({
    type: 'BAYTS_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromSelection({model, keys: ['baytsAlertsOptions', 'previousAlertsAsset'], role: PREVIOUS_ALERTS}),
        ...fromId({
            model,
            keys: ['baytsAlertsOptions', 'wetlandMaskAsset'],
            toReference: assetReference,
            role: WETLAND_MASK
        })
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: BAYTS_ALERT_BANDS, evidence: []})
    })
})
