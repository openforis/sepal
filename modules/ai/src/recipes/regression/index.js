const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'REGRESSION',
    name: 'Regression',
    description: 'Continuous-value prediction per pixel using Random Forest, Gradient Tree Boost, or CART regression. Trains on labeled points where the label is a real number (e.g. canopy cover percent, biomass).',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Source images and bands', fields: ['inputImagery']},
        {id: 'trainingData', name: 'Training Data', description: 'Points with continuous target values', fields: ['trainingData']},
        {id: 'auxiliaryImagery', name: 'Auxiliary Imagery', description: 'Optional latitude/terrain/water layers', fields: ['auxiliaryImagery']},
        {id: 'classifier', name: 'Regressor', description: 'Algorithm and hyperparameters (RF, GTB, CART)', fields: ['classifier']}
    ],
    bands: {primary: ['regression']},
    visualizations: [
        {name: 'Regression', type: 'continuous', bands: ['regression'], min: [0], max: [100], palette: ['#000000', '#00FF00']}
    ]
}
