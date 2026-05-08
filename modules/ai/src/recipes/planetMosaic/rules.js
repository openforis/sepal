// Cross-field validators for planetMosaic.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isYmd = s => typeof s === 'string' && DATE_RE.test(s)
const PLANET_EPOCH = '2013-04-01'

const todayStr = () => {
    const d = new Date()
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const rules = [
    {
        name: 'fromDateBeforeToDate',
        description: 'dates.fromDate must be strictly before dates.toDate. The interval is half-open: scenes acquired ON toDate are NOT included.',
        validate: model => {
            const {fromDate, toDate} = model?.dates || {}
            if (!isYmd(fromDate) || !isYmd(toDate)) return []
            if (fromDate >= toDate) {
                return [{path: '/dates/toDate', message: `must be strictly after dates.fromDate (${fromDate}), got ${toDate}`}]
            }
            return []
        }
    },
    {
        name: 'fromDateAfterPlanetEpoch',
        description: `dates.fromDate must be on or after ${PLANET_EPOCH} (Planet's earliest imagery).`,
        validate: model => {
            const {fromDate} = model?.dates || {}
            if (!isYmd(fromDate)) return []
            if (fromDate < PLANET_EPOCH) {
                return [{path: '/dates/fromDate', message: `must be on or after ${PLANET_EPOCH}, got ${fromDate}`}]
            }
            return []
        }
    },
    {
        name: 'toDateNotInFuture',
        description: 'dates.toDate must be on or before today + 1 day (i.e. tomorrow at the latest, since toDate is exclusive). Future toDates produce empty mosaics.',
        validate: model => {
            const {toDate} = model?.dates || {}
            if (!isYmd(toDate)) return []
            const today = todayStr()
            if (toDate > today) {
                // allow tomorrow (toDate exclusive of today's data covers up to today)
                const t = new Date(today + 'T00:00:00Z')
                t.setUTCDate(t.getUTCDate() + 1)
                const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
                if (toDate > tomorrow) {
                    return [{path: '/dates/toDate', message: `must be on or before ${tomorrow}, got ${toDate}`}]
                }
            }
            return []
        }
    },
    {
        name: 'histogramMatchingOnlyForDaily',
        description: "options.histogramMatching is meaningful only when sources.source is 'DAILY'. The GUI hides the toggle for BASEMAPS and the EE backend ignores it. Setting it to 'ENABLED' for BASEMAPS is harmless but indicates a misunderstanding.",
        validate: model => {
            const source = model?.sources?.source
            const hist = model?.options?.histogramMatching
            if (source === 'DAILY') return []
            if (hist === 'ENABLED') {
                return [{
                    path: '/options/histogramMatching',
                    message: `is ignored for sources.source='${source}' (only meaningful for DAILY); set to DISABLED to avoid ambiguity`
                }]
            }
            return []
        }
    }
]

module.exports = {rules}
