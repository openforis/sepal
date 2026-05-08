const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'BAND_MATH',
    name: 'Band Math',
    description: 'Compute derived bands from one or more input images via math expressions or per-pixel reducers. Outputs are user-named bands stacked into a single image.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Add source images and pick which bands to expose', fields: ['inputImagery']},
        {id: 'calculations', name: 'Calculations', description: 'Define expressions or reducer-based aggregations', fields: ['calculations']},
        {id: 'outputBands', name: 'Output Bands', description: 'Choose which calculation outputs (and their bands) the recipe exposes', fields: ['outputBands']}
    ],
    bands: {
        note: 'Output band names are user-defined per calculation/outputImages — see calculations[*].includedBands and outputBands.outputImages[*].outputBands.'
    },
    visualizations: []
}
