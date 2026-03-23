module.exports = {
    id: 'UNSUPERVISED_CLASSIFICATION',
    name: 'Unsupervised Classification',
    description: 'Unsupervised pixel clustering (K-means, etc.) without training data',
    parameterSchema: {
        type: 'object',
        properties: {
            inputImagery: {
                type: 'object',
                description: 'Source image (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            sampling: {
                type: 'object',
                properties: {
                    numberOfSamples: {type: 'integer', minimum: 1, description: 'Number of training samples'},
                    sampleScale: {type: 'number', description: 'Scale for sampling (meters)'}
                }
            },
            auxiliaryImagery: {type: 'array', items: {type: 'string'}},
            clusterer: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['KMEANS', 'LVQ', 'XMEANS', 'CASCADE_KMEANS', 'COBWEB']},
                    numberOfClusters: {type: 'integer', minimum: 2, description: 'Number of clusters'}
                },
                required: ['type', 'numberOfClusters']
            }
        },
        required: ['clusterer']
    },
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Image', description: 'Select the image to classify', fields: ['inputImagery']},
        {id: 'sampling', name: 'Sampling', description: 'Configure sample count and scale', fields: ['sampling']},
        {id: 'clusterer', name: 'Clusterer', description: 'Select algorithm and number of clusters', fields: ['clusterer', 'auxiliaryImagery']}
    ],
    bands: {
        output: ['class']
    },
    visualizations: [
        {name: 'Clusters', type: 'categorical', bands: ['class'], description: 'Cluster assignments'}
    ]
}
