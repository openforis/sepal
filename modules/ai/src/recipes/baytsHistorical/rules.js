const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isYmd = s => typeof s === 'string' && DATE_RE.test(s)

const rules = [
    {
        name: 'fromBeforeTo',
        description: 'dates.fromDate must be strictly before dates.toDate.',
        validate: model => {
            const {fromDate, toDate} = model?.dates || {}
            if (!isYmd(fromDate) || !isYmd(toDate)) return []
            if (fromDate >= toDate) {
                return [{path: '/dates/toDate', message: `must be strictly after fromDate (${fromDate}), got ${toDate}`}]
            }
            return []
        }
    },
    {
        name: 'minAngleLessThanMaxAngle',
        description: "When options.mask includes 'SIDES', options.minAngle must be < options.maxAngle.",
        validate: model => {
            const opts = model?.options
            if (!opts?.mask?.includes?.('SIDES')) return []
            const {minAngle, maxAngle} = opts
            if (typeof minAngle !== 'number' || typeof maxAngle !== 'number') return []
            if (minAngle >= maxAngle) {
                return [{path: '/options/minAngle', message: `must be strictly less than maxAngle (${maxAngle}), got ${minAngle}`}]
            }
            return []
        }
    }
]

module.exports = {rules}
