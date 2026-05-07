const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CLASS_CHANGE',
    name: 'Class Change',
    description: 'Detect categorical land-cover transitions between two classified images. Encodes per-pixel (from-class, to-class) pairs as integer transition codes; emits a confidence band when both inputs carry per-class probability bands and identical legends.',
    useCases: [
        'Land-cover transition mapping (forest → non-forest, cropland → urban, etc.)',
        'Confidence-weighted transition map combining two classifications',
        'Building a transition matrix between two snapshots'
    ],
    terms: ['class change', 'land-cover change', 'land-use change', 'transition', 'transition matrix', 'from-class to-class', 'categorical change', 'deforestation transition'],
    chooseWhen: 'User has TWO classified maps (or two CLASSIFICATION recipes) of the same area and wants per-pixel categorical transitions.',
    dontChooseWhen: 'User wants change on a continuous index — use INDEX_CHANGE. Wants to relabel a single classified map — use REMAPPING. Wants to produce the classified maps in the first place — use CLASSIFICATION.',
    outputs: '`transition` band encoding (fromClass, toClass) pairs as integers; optional `confidence` band when both inputs have per-class probability bands and identical legends.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'fromImage', name: 'From Image', description: 'Select the baseline classification (a SEPAL classification recipe or an Earth Engine asset)', fields: ['fromImage']},
        {id: 'toImage', name: 'To Image', description: 'Select the comparison classification', fields: ['toImage']},
        {id: 'legend', name: 'Legend', description: 'Auto-generated transition legend (labels and colors editable)', fields: ['legend']},
        {id: 'options', name: 'Options', description: 'Tune the minimum-confidence threshold (only meaningful when both inputs have probability bands)', fields: ['options']}
    ],
    bands: {
        always: ['transition'],
        whenProbabilitiesAvailable: ['confidence']
    },
    visualizations: [
        {name: 'Transition', type: 'categorical', bands: ['transition'], description: 'Color-coded by legend.entries[*].color (auto-generated from fromImage x toImage legends)'},
        {name: 'Confidence', type: 'continuous', bands: ['confidence'], min: [0], max: [100], description: 'Combined per-pixel certainty; only present when both inputs have probability bands and identical legends'}
    ]
}
