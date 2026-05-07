const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'REMAPPING',
    name: 'Remapping',
    description: 'Reclassify pixels via per-class constraint expressions over one or more inputs. Use for: collapsing fine classes into broader ones, deriving categorical from continuous (forest/non-forest from canopy cover), fusing rasters into a single class label.',
    useCases: [
        'Collapse fine-grained land-cover into broader classes',
        'Derive forest/non-forest from continuous canopy-cover %',
        'Fuse multiple rasters into a single class via expressions',
        'Threshold continuous bands into categorical zones (e.g. elevation belts)'
    ],
    terms: ['remapping', 'reclassification', 'recode', 'reclassify', 'class collapsing', 'fuse', 'combine', 'decision rules', 'constraint expressions', 'thresholding'],
    chooseWhen: 'Has rasters (continuous or categorical); defines new classes via per-class constraint expressions, no training data.',
    dontChooseWhen: 'Supervised from training data → CLASSIFICATION. Two-date class change → CLASS_CHANGE. Continuous-index diff → INDEX_CHANGE.',
    outputs: '`class` band with the new categorical scheme from `legend.entries`.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Pick the source images and the bands to make available to the constraint expressions', fields: ['inputImagery']},
        {id: 'legend', name: 'Legend', description: 'Define the target classes (value, label, color)', fields: ['legend']},
        {id: 'mapping', name: 'Mapping', description: 'For each target class, define the constraint expression that selects which pixels belong to it', fields: ['legend']}
    ],
    bands: {
        primary: ['class']
    },
    visualizations: [
        {name: 'Class', type: 'categorical', bands: ['class'], description: 'Color-coded by legend.entries[*].color'}
    ]
}
