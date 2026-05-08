const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CLASS_CHANGE',
    name: 'Class Change',
    description: 'Categorical transitions between two classified images. Per-pixel (from-class, to-class) → integer code. Confidence band emitted when both inputs have per-class probability bands + identical legends.',
    useCases: [
        'Land-cover transition mapping (forest → non-forest, cropland → urban…)',
        'Confidence-weighted transitions from two classifications',
        'Transition matrix between two snapshots'
    ],
    terms: ['class change', 'land-cover change', 'land-use change', 'transition', 'transition matrix', 'from-class to-class', 'categorical change', 'deforestation transition'],
    chooseWhen: 'Has TWO classified maps of the same area; wants per-pixel categorical transitions.',
    dontChooseWhen: 'Continuous-index change → INDEX_CHANGE. Relabel a single classified map → REMAPPING. Need to produce the classifications → CLASSIFICATION.',
    outputs: '`transition` band (encoded fromClass×toClass integers); optional `confidence` when both inputs have probability bands + identical legends.',
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
