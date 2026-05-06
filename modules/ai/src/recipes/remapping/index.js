const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'REMAPPING',
    name: 'Remapping',
    description: 'Reclassify pixels into a new categorical scheme by combining one or more input images via per-class constraint expressions. Useful for: collapsing a fine-grained land-cover map into broader classes, deriving a categorical product from continuous inputs (e.g. forest/non-forest from canopy cover), or fusing multiple raster layers into a single class label.',
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
