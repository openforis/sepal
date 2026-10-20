import _ from 'lodash'

import {collectionType, OPTICAL} from '../collectionType.js'
import {defineRecipeType} from '../defineRecipeType.js'
import dataSetSpecs from '../optical/dataSetSpecs.js'
import {REQUIRED_BANDS_BY_INDEX, sceneBands} from '../optical/opticalBands.js'
import {MISSING_ROLE, NO_CHANGE_CLASSES, UNAVAILABLE_GATE_INDEX, UNSUPPLIED_CLASSIFIER_INPUTS} from '../output/diagnostic.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromClassificationSource} from '../source/collectionSources.js'
import {INPUT_IMAGE} from '../source/inputImagery.js'
import {ASSET} from '../source/reference.js'

// PyEO alerts classifies a monitoring composite over its AOI using another Classification recipe
// (lib/js/ee/src/pyeo/pyeoAlerts.js), which it loads to reach that classification's own input imagery.
//
// Only the classification half of the shared submodel: PyEO builds its composite from enumerated data sets
// and has no `sources.assets` list.
//
// Execution loads the classification, so one must be selected, and compares classes from and to lists that must not be
// empty. It classifies each monitoring scene with the classification's classifier, asking the scenes for every feature
// its input's band sets include - indexes and pairwise combinations are computed from scene bands, auxiliary imagery
// by the classifier itself - so the scenes must carry them. An enabled index-drop gate needs its index of the
// classification's input - calculated from an asset's spectral bands, asked of a recipe by name - and of the scenes.
// What is not known yet, an input not yet observed, refuses nothing. None of it changes the description.

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

const CHANGE_CLASSES = ['changeFromClasses', 'changeToClasses']

const hasClasses = classes => Array.isArray(classes) && classes.length > 0

const classifierInputFindings = (model, records) => {
    const required = classifierFeatures(records)
    const monitored = monitoredDataSets(model)
    if (!required.length || !monitored) {
        return []
    }
    const reflectance = reflectanceOf(model)
    const missing = required.filter(feature => !sceneBands(monitored, reflectance).includes(feature))
    if (!missing.length) {
        return []
    }
    const otherDataSetsCould = Object.keys(dataSetSpecs[reflectance] || {})
        .some(dataSet => required.every(feature => sceneBands([dataSet], reflectance).includes(feature)))
    return [{path: ['model', 'sources', otherDataSetsCould ? 'dataSets' : 'classification'], missing}]
}

const gateIndexFindings = (model, describedSourceInputs) => {
    const gate = model.pyeoAlertsOptions?.indexGate
    if (!gate) {
        return []
    }
    const index = gate.index || 'ndvi'
    const path = ['model', 'pyeoAlertsOptions', 'indexGate', 'index']
    const described = describedSourceInputs(CLASSIFICATION_SOURCE, INPUT_IMAGE) || []
    const baseline = described.length === 1
        ? {type: described[0].description.executionReference.type, bands: described[0].description.output.bands.map(({name}) => name)}
        : null
    return [
        ...monitoringSuppliesIndex(model, index) === false ? [{path, index, source: 'MONITORING'}] : [],
        ...baselineSuppliesIndex(baseline, index) === false ? [{path, index, source: 'BASELINE'}] : []
    ]
}

// Whether the monitoring scenes compute the gate's index: undefined where monitoring is not optical, or not chosen.
export const monitoringSuppliesIndex = (model, index) => {
    const monitored = monitoredDataSets(model)
    return monitored ? sceneBands(monitored, reflectanceOf(model)).includes(index) : undefined
}

// Whether the Classification's input supplies the gate's index as execution obtains it - calculated from a direct
// asset's spectral bands, asked of a recipe by name - given its `type` and `bands`: undefined while not known.
export const baselineSuppliesIndex = (baseline, index) => {
    if (!baseline?.bands) {
        return undefined
    }
    return baseline.type === ASSET
        ? (REQUIRED_BANDS_BY_INDEX[index] || [null]).every(band => baseline.bands.includes(band))
        : baseline.bands.includes(index)
}

// What the classifier reads of each scene, from the one input a classification PyEO can use: none to judge otherwise.
const classifierFeatures = records => {
    const images = records?.length === 1 ? records[0].model?.inputImagery?.images || [] : []
    return images.length === 1
        ? _.uniq((images[0].bandSetSpecs || []).flatMap(({included = []}) => included))
        : []
}

// The optical data sets monitored; none to judge where monitoring is not optical, or not chosen.
const monitoredDataSets = model => {
    const dataSets = Object.values(model.sources?.dataSets || {}).flat()
    return dataSets.length && collectionType(model.sources.dataSets) === OPTICAL ? dataSets : null
}

const reflectanceOf = model => (model.options?.corrections || []).includes('SR') ? 'SR' : 'TOA'

export default defineRecipeType({
    type: 'PYEO_ALERTS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromClassificationSource(model)
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {[AOI]: REFERENCE, [CLASSIFICATION_SOURCE]: REFERENCE}},
    configurationRequirements: [
        {
            code: MISSING_ROLE,
            operations: [IMAGE_OUTPUT],
            findings: model => model.sources?.classification ? [] : [{path: ['model', 'sources', 'classification']}]
        },
        {
            code: NO_CHANGE_CLASSES,
            operations: [IMAGE_OUTPUT],
            findings: model => CHANGE_CLASSES
                .filter(key => !hasClasses(model.sources?.[key]))
                .map(key => ({path: ['model', 'sources', key]}))
        },
        {
            code: UNSUPPLIED_CLASSIFIER_INPUTS,
            operations: [IMAGE_OUTPUT],
            findings: (model, {recordsOf}) => classifierInputFindings(model, recordsOf(CLASSIFICATION_SOURCE))
        },
        {
            code: UNAVAILABLE_GATE_INDEX,
            operations: [IMAGE_OUTPUT],
            findings: (model, {describedSourceInputs}) => gateIndexFindings(model, describedSourceInputs)
        }
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: PYEO_ALERTS_BANDS, evidence: []})
    })
})
