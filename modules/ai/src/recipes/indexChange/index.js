const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'INDEX_CHANGE',
    name: 'Index Change',
    description: 'Two-date change on a continuous spectral index. From-image vs to-image on same band → difference / ratio / normalized_difference + optional categorical change map + confidence (when both have uncertainty bands).',
    useCases: [
        'Two-date deforestation (NDVI drop)',
        'Burn severity (dNBR)',
        'Water-body change (NDWI / MNDWI shift)',
        'Urbanization (NDBI, NBI)',
        'Any continuous-index diff between two snapshots'
    ],
    terms: ['change detection', 'two-date', 'before/after', 'dNBR', 'dNDVI', 'NDVI loss', 'NDWI shift', 'difference', 'ratio', 'normalized difference', 'fromImage', 'toImage', 'burn severity', 'deforestation'],
    chooseWhen: 'Wants change between two dates on a continuous spectral index (vegetation, water, burn, built-up).',
    dontChooseWhen: 'Two CLASSIFIED maps → CLASS_CHANGE. Need supervised classification → CLASSIFICATION.',
    outputs: 'Always: difference, normalized_difference, ratio, change. `error` + `confidence` when both inputs have uncertainty bands.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'fromImage', name: 'From Image', description: 'Select the baseline image and the band to compare', fields: ['fromImage']},
        {id: 'toImage', name: 'To Image', description: 'Select the comparison image and the band to compare', fields: ['toImage']},
        {id: 'legend', name: 'Legend', description: 'Define categorical change classes (Decrease / Stable / Increase by default)', fields: ['legend']},
        {id: 'options', name: 'Options', description: 'Tune the minimum-confidence threshold for the change band', fields: ['options']}
    ],
    bands: {
        always: ['difference', 'normalized_difference', 'ratio', 'change'],
        whenBothErrorBands: ['error', 'confidence']
    },
    visualizations: [
        {name: 'Change', type: 'categorical', bands: ['change'], description: 'Color-coded by legend.entries[*].color'},
        {name: 'Difference', type: 'continuous', bands: ['difference'], min: [-1], max: [1], palette: ['#d73027', '#ffffff', '#1a9850']},
        {name: 'Normalized Difference', type: 'continuous', bands: ['normalized_difference'], min: [-1], max: [1], palette: ['#d73027', '#ffffff', '#1a9850']},
        {name: 'Ratio', type: 'continuous', bands: ['ratio'], min: [0.5], max: [2], palette: ['#d73027', '#ffffff', '#1a9850']}
    ]
}
