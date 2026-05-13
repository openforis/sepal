// Cross-field validators for CCDC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isYmd = s => typeof s === 'string' && DATE_RE.test(s)

const rules = [
    {
        name: 'startBeforeEnd',
        description: 'dates.startDate must be strictly before dates.endDate (half-open interval — endDate is exclusive).',
        validate: model => {
            const {startDate, endDate} = model?.dates || {}
            if (!isYmd(startDate) || !isYmd(endDate)) return []
            if (startDate >= endDate) {
                return [{path: '/dates/endDate', message: `must be strictly after startDate (${startDate}), got ${endDate}`}]
            }
            return []
        }
    }
]

module.exports = {rules}
