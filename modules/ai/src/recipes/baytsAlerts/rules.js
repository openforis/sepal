// Cross-field validators for baytsAlerts.

const rules = [
    {
        name: 'lowBelowHighConfidence',
        description: 'baytsAlertsOptions.lowConfidenceThreshold must be strictly less than baytsAlertsOptions.highConfidenceThreshold.',
        validate: model => {
            const opts = model?.baytsAlertsOptions
            if (!opts) return []
            const {lowConfidenceThreshold: low, highConfidenceThreshold: high} = opts
            if (typeof low !== 'number' || typeof high !== 'number') return []
            if (low >= high) {
                return [{
                    path: '/baytsAlertsOptions/lowConfidenceThreshold',
                    message: `must be strictly less than highConfidenceThreshold (${high}), got ${low}`
                }]
            }
            return []
        }
    }
]

module.exports = {rules}
