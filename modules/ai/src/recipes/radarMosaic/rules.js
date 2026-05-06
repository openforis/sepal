// Cross-field validation rules for the radarMosaic recipe model.
// These complement the JSON Schema by capturing constraints that JSON Schema
// cannot express (date arithmetic, value-relative comparisons, etc.).
//
// Each rule is an object with:
//   - name: short identifier
//   - description: human-readable rule statement, exposed to the LLM via recipe_schema
//   - validate(model): returns an array of {path, message} errors (empty if model passes)

const SENTINEL_1_START = '2014-06-15'
// Earliest fromDate the GUI can emit: yearly time-scan with year=2014 → 2014-01-01.
const EARLIEST_FROM_DATE = '2014-01-01'

const today = () => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// Latest toDate the GUI can emit: yearly time-scan with year=currentYear → (currentYear+1)-01-01.
const latestToDate = () => `${new Date().getFullYear() + 1}-01-01`

const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

const rules = [
    {
        name: 'targetDateInSentinel1Coverage',
        description: `For point-in-time mosaics, dates.targetDate must be in [${SENTINEL_1_START}, today].`,
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.targetDate)) return []
            const value = dates.targetDate
            const max = today()
            if (value < SENTINEL_1_START || value > max) {
                return [{
                    path: 'dates.targetDate',
                    message: `must be between ${SENTINEL_1_START} (Sentinel-1 data start) and ${max} (today), got ${value}`
                }]
            }
            return []
        }
    },
    {
        name: 'fromDateBeforeToDate',
        description: 'For time-scan mosaics, dates.fromDate must be strictly before dates.toDate.',
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.fromDate) || !isYmd(dates.toDate)) return []
            if (dates.fromDate >= dates.toDate) {
                return [{
                    path: 'dates.toDate',
                    message: `must be strictly after dates.fromDate (${dates.fromDate}), got ${dates.toDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'fromDateNotBeforeSentinel1Era',
        description: `For time-scan mosaics, dates.fromDate must be on or after ${EARLIEST_FROM_DATE} (no Sentinel-1 data exists before that).`,
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.fromDate)) return []
            if (dates.fromDate < EARLIEST_FROM_DATE) {
                return [{
                    path: 'dates.fromDate',
                    message: `must be on or after ${EARLIEST_FROM_DATE}, got ${dates.fromDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'dateIntervalOverlapsSentinel1Coverage',
        description: `For time-scan mosaics, the [fromDate, toDate) interval must overlap Sentinel-1 coverage — dates.toDate must be after ${SENTINEL_1_START}.`,
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.toDate)) return []
            if (dates.toDate <= SENTINEL_1_START) {
                return [{
                    path: 'dates.toDate',
                    message: `interval must overlap Sentinel-1 coverage: must be after ${SENTINEL_1_START}, got ${dates.toDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'fromDateNotInFuture',
        description: 'For time-scan mosaics, dates.fromDate must be on or before today (otherwise the interval is entirely in the future and contains no observations).',
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.fromDate)) return []
            const max = today()
            if (dates.fromDate > max) {
                return [{
                    path: 'dates.fromDate',
                    message: `interval must not be entirely in the future: must be on or before today (${max}), got ${dates.fromDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'toDateNotTooFarInFuture',
        description: 'For time-scan mosaics, dates.toDate must be on or before the start of the year after the current year.',
        validate: ({dates}) => {
            if (!dates || !isYmd(dates.toDate)) return []
            const max = latestToDate()
            if (dates.toDate > max) {
                return [{
                    path: 'dates.toDate',
                    message: `must be on or before ${max} (the start of the year after the current year), got ${dates.toDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'minAngleLessThanMaxAngle',
        description: "When options.mask includes 'SIDES', options.minAngle must be strictly less than options.maxAngle.",
        validate: ({options}) => {
            if (!options || !options.mask || !options.mask.includes('SIDES')) return []
            const {minAngle, maxAngle} = options
            if (typeof minAngle !== 'number' || typeof maxAngle !== 'number') return []
            if (minAngle >= maxAngle) {
                return [{
                    path: 'options.minAngle',
                    message: `must be strictly less than options.maxAngle (${maxAngle}), got ${minAngle}`
                }]
            }
            return []
        }
    },
    {
        name: 'multitemporalRequiresSpatial',
        description: "When options.spatialSpeckleFilter is 'NONE', options.multitemporalSpeckleFilter must also be 'NONE' — multi-temporal speckle filtering requires a spatial filter to operate on.",
        validate: ({options}) => {
            if (!options) return []
            const spatial = options.spatialSpeckleFilter
            const multi = options.multitemporalSpeckleFilter
            if (spatial === 'NONE' && multi && multi !== 'NONE') {
                return [{
                    path: 'options.multitemporalSpeckleFilter',
                    message: `must be 'NONE' when options.spatialSpeckleFilter is 'NONE', got '${multi}'`
                }]
            }
            return []
        }
    }
]

module.exports = {rules}
