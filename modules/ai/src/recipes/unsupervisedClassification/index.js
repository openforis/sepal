const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'UNSUPERVISED_CLASSIFICATION',
    name: 'Unsupervised Classification',
    description: 'Pixel clustering without training data — K-means and variants (LVQ, X-means, Cascade-K-means, Cobweb). Stack input images plus optional auxiliary layers, sample N pixels, train clusterer, apply per-pixel.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Imagery', description: 'Source images and bands to cluster on', fields: ['inputImagery']},
        {id: 'sampling', name: 'Sampling', description: 'Number of training samples and sample scale', fields: ['sampling']},
        {id: 'auxiliaryImagery', name: 'Auxiliary Imagery', description: 'Optionally add latitude / terrain / surface-water layers as features', fields: ['auxiliaryImagery']},
        {id: 'clusterer', name: 'Clusterer', description: 'Algorithm and parameters', fields: ['clusterer']}
    ],
    bands: {
        primary: ['class']
    },
    visualizations: [
        {name: 'Cluster', type: 'categorical', bands: ['class'], description: 'Color-coded by cluster id'}
    ]
}
