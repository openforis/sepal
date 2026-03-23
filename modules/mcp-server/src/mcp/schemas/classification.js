module.exports = {
    id: 'CLASSIFICATION',
    name: 'Classification',
    description: 'Supervised pixel classification using Random Forest, Gradient Tree Boost, CART, SVM, or other classifiers',
    parameterSchema: {
        type: 'object',
        properties: {
            trainingData: {
                type: 'object',
                description: 'Training data configuration',
                properties: {
                    dataSets: {
                        type: 'array',
                        description: 'Training data sets',
                        items: {
                            type: 'object',
                            properties: {
                                dataSetId: {type: 'string'},
                                name: {type: 'string'},
                                type: {type: 'string', enum: ['COLLECTED', 'GEE_TABLE', 'CSV', 'SAMPLE_CLASSIFICATION']},
                                referenceData: {type: 'array', items: {type: 'object'}}
                            }
                        }
                    }
                }
            },
            auxiliaryImagery: {
                type: 'array',
                description: 'Auxiliary imagery layers (e.g. DEM, slope)',
                items: {type: 'string'}
            },
            classifier: {
                type: 'object',
                description: 'Classifier configuration',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'NAIVE_BAYES', 'SVM', 'MINIMUM_DISTANCE', 'DECISION_TREE'],
                        description: 'Classifier algorithm'
                    },
                    numberOfTrees: {type: 'integer', minimum: 1, description: 'Number of trees (RF, GTB)'},
                    variablesPerSplit: {type: ['integer', 'null'], description: 'Variables per split (RF)'},
                    minLeafPopulation: {type: 'integer', minimum: 1, description: 'Min leaf population (RF, GTB, CART)'},
                    bagFraction: {type: 'number', minimum: 0, maximum: 1, description: 'Bag fraction (RF)'},
                    maxNodes: {type: ['integer', 'null'], description: 'Max nodes (RF, GTB, CART)'},
                    seed: {type: 'integer', description: 'Random seed (RF)'},
                    shrinkage: {type: 'number', description: 'Learning rate (GTB)'},
                    samplingRate: {type: 'number', minimum: 0, maximum: 1, description: 'Sampling rate (GTB)'},
                    loss: {type: 'string', description: 'Loss function (GTB)'},
                    lambda: {type: 'number', description: 'Regularization (GTB)'},
                    decisionProcedure: {type: 'string', enum: ['Voting', 'Margin', 'Score'], description: 'Decision procedure (SVM)'},
                    svmType: {type: 'string', enum: ['C_SVC', 'NU_SVC', 'ONE_CLASS', 'EPSILON_SVR', 'NU_SVR'], description: 'SVM type'},
                    kernelType: {type: 'string', enum: ['LINEAR', 'POLY', 'RBF', 'SIGMOID'], description: 'Kernel type (SVM)'},
                    metric: {type: 'string', enum: ['euclidean', 'cosine', 'mahalanobis', 'manhattan'], description: 'Distance metric (Minimum Distance)'}
                },
                required: ['type']
            },
            legend: {
                type: 'object',
                description: 'Class legend definition',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                value: {type: 'integer', description: 'Class value'},
                                label: {type: 'string', description: 'Class label'},
                                color: {type: 'string', description: 'Hex color (#RRGGBB)'}
                            },
                            required: ['value', 'label', 'color']
                        }
                    }
                }
            }
        },
        required: ['classifier']
    },
    workflowSteps: [
        {id: 'trainingData', name: 'Training Data', description: 'Configure training data sources and reference points', fields: ['trainingData']},
        {id: 'legend', name: 'Legend', description: 'Define class labels, values, and colors', fields: ['legend']},
        {id: 'classifier', name: 'Classifier', description: 'Select and configure the classification algorithm', fields: ['classifier', 'auxiliaryImagery']}
    ],
    bands: {
        classification: ['class'],
        probability: ['regression', 'class_probability']
    },
    visualizations: [
        {name: 'Classification', type: 'categorical', bands: ['class'], description: 'Color-coded by class legend'}
    ]
}
