const SENTINEL_1_START = '2014-06-15'
const EARLIEST_FROM_DATE = '2014-01-01'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isYmd = s => typeof s === 'string' && DATE_RE.test(s)

const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
        name: 'fromDateNotBeforeSentinel1Era',
        description: `dates.fromDate must be on or after ${EARLIEST_FROM_DATE} (no Sentinel-1 data exists before that).`,
        validate: model => {
            const {fromDate} = model?.dates || {}
            if (!isYmd(fromDate)) return []
            if (fromDate < EARLIEST_FROM_DATE) {
                return [{path: '/dates/fromDate', message: `must be on or after ${EARLIEST_FROM_DATE}, got ${fromDate}`}]
            }
            return []
        }
    },
    {
        name: 'dateIntervalOverlapsSentinel1Coverage',
        description: `The [fromDate, toDate) interval must overlap Sentinel-1 coverage — dates.toDate must be after ${SENTINEL_1_START}.`,
        validate: model => {
            const {toDate} = model?.dates || {}
            if (!isYmd(toDate)) return []
            if (toDate <= SENTINEL_1_START) {
                return [{path: '/dates/toDate', message: `interval must overlap Sentinel-1 coverage: must be after ${SENTINEL_1_START}, got ${toDate}`}]
            }
            return []
        }
    },
    {
        name: 'fromDateNotInFuture',
        description: 'dates.fromDate must be on or before today (otherwise the interval is entirely in the future and contains no observations).',
        validate: model => {
            const {fromDate} = model?.dates || {}
            if (!isYmd(fromDate)) return []
            const max = today()
            if (fromDate > max) {
                return [{path: '/dates/fromDate', message: `interval must not be entirely in the future: must be on or before today (${max}), got ${fromDate}`}]
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
    },
    {
        name: 'multitemporalRequiresSpatial',
        description: "When options.spatialSpeckleFilter is 'NONE', options.multitemporalSpeckleFilter must also be 'NONE' — multi-temporal speckle filtering requires a spatial filter to operate on.",
        validate: model => {
            const opts = model?.options
            if (!opts) return []
            const spatial = opts.spatialSpeckleFilter
            const multi = opts.multitemporalSpeckleFilter
            if (spatial === 'NONE' && multi && multi !== 'NONE') {
                return [{path: '/options/multitemporalSpeckleFilter', message: `must be 'NONE' when options.spatialSpeckleFilter is 'NONE', got '${multi}'`}]
            }
            return []
        }
    }
]

module.exports = {rules}
