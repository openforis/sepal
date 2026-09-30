import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromClassificationSource} from '../source/collectionSources.js'

// PyEO alerts classifies a monitoring composite over its AOI using another Classification recipe
// (lib/js/ee/src/pyeo/pyeoAlerts.js), which it loads to reach that classification's own input imagery.
//
// Only the classification half of the shared submodel: PyEO builds its composite from enumerated data sets
// and has no `sources.assets` list.

export {CLASSIFICATION_SOURCE}

// The change report, in the order the algorithm assembles it (lib/js/ee/src/pyeo/runPyeoChangeAlerts.js), with or
// without the index-drop gate. Every band is exported by sample. No encoding is declared.
export const PYEO_ALERTS_BANDS = [
    'available_image_count', 'occluded_count', 'total_changes',
    'first_change_date_above_threshold', 'post_fcd_change_count',
    'post_fcd_nochange_count', 'post_fcd_occluded_count',
    'post_fcd_valid_image_count', 'post_fcd_change_repeatability_pct',
    'binary_timeseries_decision', 'fcd_decision_map', 'delta_index_change_count',
    'binary_delta_index_decision_map', 'binary_delta_class_decision_map',
    'binary_combined_delta_decision_map', 'from_class_count', 'to_class_count',
    'binary_decision_from_to_map'
].map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

export default defineRecipeType({
    type: 'PYEO_ALERTS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromClassificationSource(model)
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: PYEO_ALERTS_BANDS, evidence: []})
    })
})
