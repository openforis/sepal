const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'STACK',
    name: 'Stack',
    description: 'Combine bands from multiple input images (recipes or assets) into a single multi-band stacked image with optional per-band rename. No math — bands are passed through.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Add the source images to stack', fields: ['inputImagery']},
        {id: 'bandNames', name: 'Band Names', description: 'Pick which bands to keep from each image and what to call them in the output', fields: ['bandNames']}
    ],
    bands: {note: 'Output band names are user-defined per bandNames.bandNames[*].bands[*].outputName.'},
    visualizations: []
}
