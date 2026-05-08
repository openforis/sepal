const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CLASSIFICATION',
    name: 'Classification',
    description: 'Supervised pixel classification (RF, GBT, CART, NB, SVM, Min Distance, manual decision tree). Trains on labeled reference points; applies to SEPAL recipes or EE assets.',
    useCases: [
        'Land-cover / land-use mapping',
        'Crop type classification',
        'Forest/non-forest from training points',
        'Burnt-area or disturbance with categorical labels',
        'Per-class probability bands for downstream confidence'
    ],
    terms: ['classification', 'supervised', 'Random Forest', 'RF', 'GTB', 'Gradient Tree Boost', 'CART', 'SVM', 'Naive Bayes', 'Minimum Distance', 'decision tree', 'training data', 'reference data', 'reference points', 'classifier', 'legend', 'class probabilities'],
    chooseWhen: 'Wants categorical map from training data, mentions reference points or a classifier, or wants class labels + probabilities.',
    dontChooseWhen: 'Has existing classified map → relabel/collapse: REMAPPING. Two classified maps → transitions: CLASS_CHANGE. Continuous-index change: INDEX_CHANGE.',
    outputs: '`class` (integer values), optional `class_probability` (0-100%), per-class `probability_<value>` when configured.',
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
