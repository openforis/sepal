// Cross-field validators for unsupervisedClassification.

const rules = [
    {
        name: 'minLessThanMaxClusters',
        description: 'When clusterer is XMEANS or CASCADE_KMEANS, minNumberOfClusters must be ≤ maxNumberOfClusters.',
        validate: model => {
            const c = model?.clusterer
            if (!['XMEANS', 'CASCADE_KMEANS'].includes(c?.type)) return []
            const min = c?.minNumberOfClusters
            const max = c?.maxNumberOfClusters
            if (typeof min !== 'number' || typeof max !== 'number') return []
            if (min > max) {
                return [{
                    path: '/clusterer/minNumberOfClusters',
                    message: `must be <= maxNumberOfClusters (${max}), got ${min}`
                }]
            }
            return []
        }
    }
]

module.exports = {rules}
