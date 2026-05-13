module.exports = {
    id: 'REGRESSION',
    name: 'Regression',
    description: 'Continuous value prediction using machine learning regression (Random Forest, Gradient Tree Boost, CART)',
    parameterSchema: {
        type: 'object',
        properties: {
            trainingData: {
                type: 'object',
                properties: {
                    dataSets: {type: 'array', items: {type: 'object'}}
                }
            },
            auxiliaryImagery: {type: 'array', items: {type: 'string'}},
            classifier: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART']},
                    numberOfTrees: {type: 'integer', minimum: 1},
                    variablesPerSplit: {type: ['integer', 'null']},
                    minLeafPopulation: {type: 'integer', minimum: 1},
                    bagFraction: {type: 'number', minimum: 0, maximum: 1},
                    maxNodes: {type: ['integer', 'null']},
                    seed: {type: 'integer'}
                },
                required: ['type']
            }
        },
        required: ['classifier']
    },
    workflowSteps: [
        {id: 'trainingData', name: 'Training Data', description: 'Provide continuous-value training data', fields: ['trainingData']},
        {id: 'classifier', name: 'Classifier', description: 'Configure regression algorithm', fields: ['classifier', 'auxiliaryImagery']}
    ],
    bands: {
        output: ['regression']
    },
    visualizations: [
        {name: 'Regression', type: 'continuous', bands: ['regression'], min: [0], max: [100], palette: ['#000000', '#00FF00']}
    ]
}
