// Cross-field validators for changeAlerts.

const rules = [
    {
        name: 'minNumberOfChangesWithinObservations',
        description: 'changeAlertsOptions.minNumberOfChanges must be in [ceil(numberOfObservations/2), numberOfObservations]. The GUI enforces this constraint via slider predicates.',
        validate: model => {
            const opts = model?.changeAlertsOptions
            if (!opts) return []
            const {numberOfObservations: n, minNumberOfChanges: m} = opts
            if (typeof n !== 'number' || typeof m !== 'number') return []
            const lo = Math.ceil(n / 2)
            if (m < lo || m > n) {
                return [{
                    path: '/changeAlertsOptions/minNumberOfChanges',
                    message: `must be in [${lo}, ${n}] (ceil(numberOfObservations/2) to numberOfObservations), got ${m}`
                }]
            }
            return []
        }
    }
]

module.exports = {rules}
