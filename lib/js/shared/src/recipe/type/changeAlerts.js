import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromSelection} from '../source/extract.js'

// Change alerts monitors a CCDC reference against a freshly built collection
// (lib/js/ee/src/timeSeries/changeAlerts.js). Two independent halves:
//
//   model.reference  the selected CCDC source, recipe OR asset. imageFactory resolves it either way, and its
//                    geometry is what the recipe is clipped to - there is no separate AOI.
//   model.sources    the collection Change Alerts monitors against, seeded from the producer of the
//                    referenced segments and editable afterwards. So this recipe owns the same
//                    classification and asset dependencies CCDC does.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'
export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

// The changes: the bands the algorithm selects last, in that order (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js),
// whatever the source type, the confidence settings or the observations found - those decide masks and values, never
// which bands exist. Earth Engine's catalogue and the GUI's presentation take their names from here too. The schema follows from the
// type alone, so it is known before a period or a reference is chosen; whether such a recipe can execute is a separate
// question, which execution answers by refusing it. Dates are fractional years, and the dates and counts are no
// average of neighbours, so every band is sampled at coarser pyramid levels, as Retrieve has always exported them. No
// encoding is declared. The monitoring and calibration mosaics a layer can show instead are a separate product, not
// this output.
export const CHANGE_ALERT_BANDS = [
    'last_stable_date',
    'first_detection_date',
    'confirmation_date',
    'last_detection_date',
    'confidence',
    'difference',
    'detection_count',
    'monitoring_observation_count',
    'calibration_observation_count'
].map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

export default defineRecipeType({
    type: 'CHANGE_ALERTS',
    directSources: model => [
        ...fromSelection({model, keys: ['reference'], role: PRIMARY_IMAGE}),
        ...fromCollectionSources(model)
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: CHANGE_ALERT_BANDS, evidence: []})
    })
})
