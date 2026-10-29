import {
    classifiedImageFeatures,
    classifierFeatures,
    opticalAlternatives,
    reflectanceOf,
    UNSUPPLIED_CLASSIFIER_INPUTS,
    unsuppliedClassifierFeatures
} from '../classifierInputs.js'
import {collectionType, OPTICAL} from '../collectionType.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {REQUIRED_BANDS_BY_INDEX, sceneBands} from '../optical/opticalBands.js'
import {MISSING_ROLE} from '../output/diagnostic.js'
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
// classification's input - a recipe's own band of that name, otherwise calculated of the spectral bands the input
// outputs (baselineIndexSource) - and of the scenes.
// What is not known yet, an input not yet observed, refuses nothing. None of it changes the description.
//
// Its baseline is the classification's own image, built and classified as that recipe's own output is: what running
// that image needs - its input imagery, its training data and what reuses it, the features it trains on - is needed
// here too (IMAGE_OUTPUT), gate or no gate. The scenes are classified with the classifier that trains.

// A PyEO Alerts class list - the classes change is detected from, or to - configured empty: execution has nothing to
// detect change between.
export const NO_CHANGE_CLASSES = 'NO_CHANGE_CLASSES'

// A PyEO Alerts whose Classification classifies more than one input image: execution reads its baseline - the bands its
// classifier references, and the gate's index - of that recipe's one input (lib/js/ee/src/pyeo/pyeoAlerts.js), gate or
// no gate. Named with the `count` it has. One with none is that recipe's own refusal, said there.
export const MULTIPLE_CLASSIFICATION_INPUTS = 'MULTIPLE_CLASSIFICATION_INPUTS'

// A PyEO Alerts index-drop gate whose index the Classification's input (`source: 'BASELINE'`) or the monitoring scenes
// (`source: 'MONITORING'`) cannot supply, located at the gate's index: another index repairs it - those both can supply,
// as far as is known, named as `alternatives` - or no gate. Judged only over a classification of one input the
// monitoring data can feed: any other leaves the analysis nothing to gate.
export const UNAVAILABLE_GATE_INDEX = 'UNAVAILABLE_GATE_INDEX'

// The indexes the drop gate offers: land-change normalized differences, a drop signalling disturbance.
export const GATE_INDEXES = ['ndvi', 'ndmi', 'nbr']

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

// Only a Classification record held is judged: one still being read, or unreadable, establishes nothing.
const inputCountFindings = records => {
    const count = records?.length === 1 ? (records[0].model?.inputImagery?.images || []).length : 0
    return count > 1 ? [{path: ['model', 'sources', 'classification'], count}] : []
}

// Only optical monitoring is judged, and only another optical data set offered as a repair: the collections PyEO monitors.
// Judged only over a classification of one input, which execution reads its features of.
const classifierInputFindings = (model, records) => {
    if (inputCountFindings(records).length) {
        return []
    }
    const unsupplied = unsuppliedClassifierFeatures({
        required: classifierFeatures(records),
        supplied: monitoredDataSets(model) && classifiedImageFeatures(model),
        alternatives: opticalAlternatives(model.options)
    })
    return unsupplied
        ? [{path: ['model', 'sources', unsupplied.alternative ? 'dataSets' : 'classification'], missing: unsupplied.missing}]
        : []
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
    const alternatives = GATE_INDEXES.filter(other => other !== index
        && monitoringSuppliesIndex(model, other) !== false && baselineSuppliesIndex(baseline, other) !== false)
    return [
        ...monitoringSuppliesIndex(model, index) === false ? [{path, index, source: 'MONITORING', alternatives}] : [],
        ...baselineSuppliesIndex(baseline, index) === false ? [{path, index, source: 'BASELINE', alternatives}] : []
    ]
}

// Whether the monitoring scenes compute the gate's index: undefined where monitoring is not optical, or not chosen.
export const monitoringSuppliesIndex = (model, index) => {
    const monitored = monitoredDataSets(model)
    return monitored ? sceneBands(monitored, reflectanceOf(model.options)).includes(index) : undefined
}

// How execution obtains the gate's index of the Classification's input (lib/js/ee/src/pyeo/baselineGateIndex.js), given its
// `type` and `bands` - the names it outputs, a recipe's as its declaration maps them, not those of what it reads:
// PROVIDED, a recipe's own band of that name, used as it is; CALCULATED of the spectral bands the index requires, as an
// asset's always is and a recipe's providing none is; null where neither can be; undefined while the bands are not known.
export const PROVIDED_INDEX = 'PROVIDED'
export const CALCULATED_INDEX = 'CALCULATED'

export const baselineIndexSource = (baseline, index) => {
    if (!baseline?.bands) {
        return undefined
    }
    if (baseline.type !== ASSET && baseline.bands.includes(index)) {
        return PROVIDED_INDEX
    }
    return (REQUIRED_BANDS_BY_INDEX[index] || [null]).every(band => baseline.bands.includes(band))
        ? CALCULATED_INDEX
        : null
}

// Whether the Classification's input supplies the gate's index as execution obtains it (baselineIndexSource):
// undefined while not known.
export const baselineSuppliesIndex = (baseline, index) => {
    const source = baselineIndexSource(baseline, index)
    return source === undefined ? undefined : source !== null
}

// The optical data sets monitored; none to judge where monitoring is not optical, or not chosen.
const monitoredDataSets = model => {
    const dataSets = Object.values(model.sources?.dataSets || {}).flat()
    return dataSets.length && collectionType(model.sources.dataSets) === OPTICAL ? dataSets : null
}

export default defineRecipeType({
    type: 'PYEO_ALERTS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromClassificationSource(model)
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {[AOI]: REFERENCE, [CLASSIFICATION_SOURCE]: IMAGE_OUTPUT}},
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
            code: MULTIPLE_CLASSIFICATION_INPUTS,
            operations: [IMAGE_OUTPUT],
            findings: (model, {recordsOf}) => inputCountFindings(recordsOf(CLASSIFICATION_SOURCE))
        },
        {
            code: UNSUPPLIED_CLASSIFIER_INPUTS,
            operations: [IMAGE_OUTPUT],
            findings: (model, {recordsOf}) => classifierInputFindings(model, recordsOf(CLASSIFICATION_SOURCE))
        },
        {
            code: UNAVAILABLE_GATE_INDEX,
            operations: [IMAGE_OUTPUT],
            findings: (model, {recordsOf, describedSourceInputs}) => {
                const records = recordsOf(CLASSIFICATION_SOURCE)
                return inputCountFindings(records).length || classifierInputFindings(model, records).length
                    ? []
                    : gateIndexFindings(model, describedSourceInputs)
            }
        }
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: PYEO_ALERTS_BANDS, evidence: []})
    })
})
