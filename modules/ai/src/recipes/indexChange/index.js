const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'INDEX_CHANGE',
    name: 'Index Change',
    description: 'Two-date change detection on a continuous spectral index. Compares the same band between a from-image and a to-image, producing difference/ratio/normalized-difference bands plus an optional categorical change map and (when both images carry uncertainty bands) confidence band.',
    useCases: [
        'Two-date deforestation mapping (NDVI drop)',
        'Burn severity assessment (dNBR)',
        'Water-body change (NDWI / MNDWI shift)',
        'Urbanization / built-up expansion (NDBI, NBI)',
        'Any continuous-index difference between two snapshots'
    ],
    terms: ['change detection', 'two-date', 'before/after', 'dNBR', 'dNDVI', 'NDVI loss', 'NDWI shift', 'difference', 'ratio', 'normalized difference', 'fromImage', 'toImage', 'burn severity', 'deforestation'],
    chooseWhen: 'User wants change between two dates on a continuous spectral index — typically vegetation, water, burn, or built-up indices.',
    dontChooseWhen: 'User has two CLASSIFIED maps and wants categorical transitions — use CLASS_CHANGE. Wants supervised classification — use CLASSIFICATION.',
    outputs: 'Always: difference, normalized_difference, ratio. Categorical `change` band when a legend is defined. `error` and `confidence` bands when both inputs carry uncertainty bands.',
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
        always: ['difference', 'normalized_difference', 'ratio'],
        whenLegendDefined: ['change'],
        whenBothErrorBands: ['error', 'confidence']
    },
    visualizations: [
        {name: 'Change', type: 'categorical', bands: ['change'], description: 'Color-coded by legend.entries[*].color'},
        {name: 'Difference', type: 'continuous', bands: ['difference'], min: [-1], max: [1], palette: ['#d73027', '#ffffff', '#1a9850']},
        {name: 'Normalized Difference', type: 'continuous', bands: ['normalized_difference'], min: [-1], max: [1], palette: ['#d73027', '#ffffff', '#1a9850']},
        {name: 'Ratio', type: 'continuous', bands: ['ratio'], min: [0.5], max: [2], palette: ['#d73027', '#ffffff', '#1a9850']}
    ]
}
