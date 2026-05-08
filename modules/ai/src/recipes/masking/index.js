const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'MASKING',
    name: 'Masking',
    description: 'Apply the first band of a mask image to another image as a per-pixel updateMask. Pixels where the mask is zero or masked become masked in the output; other pixels pass through unchanged.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'imageToMask', name: 'Image to Mask', description: 'Pick the image whose pixels will be masked', fields: ['imageToMask']},
        {id: 'imageMask', name: 'Mask Image', description: 'Pick the mask — only the FIRST band is used as the mask', fields: ['imageMask']}
    ],
    bands: {
        note: 'Output bands are inherited from imageToMask.'
    },
    visualizations: []
}
