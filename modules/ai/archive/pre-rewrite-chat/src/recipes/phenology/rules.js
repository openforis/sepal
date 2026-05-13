// Cross-field validators for phenology.

const rules = [
    {
        name: 'fromYearLessThanToYear',
        description: 'dates.fromYear must be ≤ dates.toYear (inclusive on both ends).',
        validate: model => {
            const f = model?.dates?.fromYear
            const t = model?.dates?.toYear
            if (typeof f !== 'number' || typeof t !== 'number') return []
            if (f > t) {
                return [{path: '/dates/toYear', message: `must be >= fromYear (${f}), got ${t}`}]
            }
            return []
        }
    }
]

module.exports = {rules}
