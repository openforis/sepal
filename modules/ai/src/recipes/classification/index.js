const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CLASSIFICATION',
    name: 'Classification',
    description: 'Supervised pixel classification using Random Forest, Gradient Tree Boost, CART, Naive Bayes, SVM, Minimum Distance, or a hand-supplied decision tree. Trains on labeled reference points and applies the model to one or more SEPAL recipe outputs or Earth Engine assets.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Choose the source images that provide per-pixel features', fields: ['inputImagery']},
        {id: 'legend', name: 'Legend', description: 'Define class labels, values, and colors', fields: ['legend']},
        {id: 'trainingData', name: 'Training Data', description: 'Configure reference data sources (collected points, EE tables, CSVs, etc.)', fields: ['trainingData']},
        {id: 'auxiliaryImagery', name: 'Auxiliary Imagery', description: 'Optionally add latitude, terrain, or surface-water layers as features', fields: ['auxiliaryImagery']},
        {id: 'classifier', name: 'Classifier', description: 'Pick and configure the classification algorithm', fields: ['classifier']}
    ],
    bands: {
        primary: ['class'],
        regression: ['regression'],
        probability: ['class_probability'],
        perClassProbability: ['probability_<value>']
    },
    visualizations: [
        {name: 'Class', type: 'categorical', bands: ['class'], description: 'Color-coded by legend.entries[*].color'},
        {name: 'Class probability', type: 'continuous', bands: ['class_probability'], min: [0], max: [100], description: 'Confidence in the predicted class, 0-100%'}
    ]
}
