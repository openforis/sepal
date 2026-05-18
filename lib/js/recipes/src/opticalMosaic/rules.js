const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return null
    const [y, m, d] = s.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
    return date
}

function addDays(date, days) {
    const result = new Date(date.getTime())
    result.setUTCDate(result.getUTCDate() + days)
    return result
}

function addYears(date, years) {
    const result = new Date(date.getTime())
    result.setUTCFullYear(result.getUTCFullYear() + years)
    return result
}

function formatDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

const LANDSAT_4_LAUNCH = parseDate('1982-08-22')

const rules = [
    {
        name: 'targetDateAfterEpoch',
        description: 'targetDate must be on or after 1982-08-22 (Landsat 4 launch). Future targetDates are allowed.',
        validate: model => {
            const target = parseDate(model?.dates?.targetDate)
            if (!target) return []
            if (target < LANDSAT_4_LAUNCH) {
                return [{path: '/dates/targetDate', message: 'must be on or after 1982-08-22'}]
            }
            return []
        }
    },
    {
        name: 'seasonStartWindow',
        description: 'seasonStart must lie in [targetDate - 1 year + 1 day, targetDate].',
        validate: model => {
            const target = parseDate(model?.dates?.targetDate)
            const start = parseDate(model?.dates?.seasonStart)
            if (!target || !start) return []
            const min = addDays(addYears(target, -1), 1)
            const max = target
            if (start < min || start > max) {
                return [{path: '/dates/seasonStart', message: `must be in [${formatDate(min)}, ${formatDate(max)}]`}]
            }
            return []
        }
    },
    {
        name: 'seasonEndWindow',
        description: 'seasonEnd must lie in [targetDate + 1 day, targetDate + 1 year].',
        validate: model => {
            const target = parseDate(model?.dates?.targetDate)
            const end = parseDate(model?.dates?.seasonEnd)
            if (!target || !end) return []
            const min = addDays(target, 1)
            const max = addYears(target, 1)
            if (end < min || end > max) {
                return [{path: '/dates/seasonEnd', message: `must be in [${formatDate(min)}, ${formatDate(max)}]`}]
            }
            return []
        }
    },
    {
        name: 'srAndCalibrateMutuallyExclusive',
        description: 'corrections cannot include both SR and CALIBRATE.',
        validate: model => {
            const corrections = model?.compositeOptions?.corrections || []
            if (corrections.includes('SR') && corrections.includes('CALIBRATE')) {
                return [{path: '/compositeOptions/corrections', message: 'SR and CALIBRATE are mutually exclusive'}]
            }
            return []
        }
    },
    {
        name: 'calibrateRequiresMultipleSources',
        description: 'corrections may include CALIBRATE only when sources.dataSets contains BOTH LANDSAT and SENTINEL_2 groups.',
        validate: model => {
            const corrections = model?.compositeOptions?.corrections || []
            if (!corrections.includes('CALIBRATE')) return []
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (groups.includes('LANDSAT') && groups.includes('SENTINEL_2')) return []
            return [{path: '/compositeOptions/corrections', message: 'CALIBRATE requires both LANDSAT and SENTINEL_2 source groups'}]
        }
    },
    {
        name: 'multipleSourcesRequireCalibrate',
        description: 'When sources.dataSets contains BOTH groups, corrections MUST include CALIBRATE.',
        validate: model => {
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (!(groups.includes('LANDSAT') && groups.includes('SENTINEL_2'))) return []
            const corrections = model?.compositeOptions?.corrections || []
            if (corrections.includes('CALIBRATE')) return []
            return [{path: '/compositeOptions/corrections', message: 'CALIBRATE is required when both LANDSAT and SENTINEL_2 source groups are selected'}]
        }
    },
    {
        name: 'multipleSourcesRequireAllScenes',
        description: 'When sources.dataSets contains BOTH groups, sceneSelectionOptions.type MUST be ALL.',
        validate: model => {
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (!(groups.includes('LANDSAT') && groups.includes('SENTINEL_2'))) return []
            const type = model?.sceneSelectionOptions?.type
            if (type === 'ALL') return []
            return [{path: '/sceneSelectionOptions/type', message: 'must be ALL when both LANDSAT and SENTINEL_2 source groups are selected'}]
        }
    },
    {
        name: 'cloudMaskingMethodAvailability',
        description: 'Each method in compositeOptions.includedCloudMasking has source-group requirements: landsatCFMask requires LANDSAT; sentinel2CloudScorePlus and sentinel2CloudProbability require SENTINEL_2; pino26 requires SENTINEL_2-only AND no SR correction.',
        validate: model => {
            const included = model?.compositeOptions?.includedCloudMasking || []
            const groups = Object.keys(model?.sources?.dataSets || {})
            const hasLandsat = groups.includes('LANDSAT')
            const hasSentinel2 = groups.includes('SENTINEL_2')
            const hasSR = (model?.compositeOptions?.corrections || []).includes('SR')
            const errors = []
            if (included.includes('landsatCFMask') && !hasLandsat) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'landsatCFMask requires LANDSAT in sources.dataSets'})
            }
            if (included.includes('sentinel2CloudScorePlus') && !hasSentinel2) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'sentinel2CloudScorePlus requires SENTINEL_2 in sources.dataSets'})
            }
            if (included.includes('sentinel2CloudProbability') && !hasSentinel2) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'sentinel2CloudProbability requires SENTINEL_2 in sources.dataSets'})
            }
            if (included.includes('pino26')) {
                if (hasLandsat || !hasSentinel2) {
                    errors.push({path: '/compositeOptions/includedCloudMasking', message: 'pino26 requires SENTINEL_2 only (no LANDSAT)'})
                }
                if (hasSR) {
                    errors.push({path: '/compositeOptions/includedCloudMasking', message: 'pino26 cannot be combined with SR correction'})
                }
            }
            return errors
        }
    },
    {
        name: 'filterTypesUnique',
        description: 'Each filter type in compositeOptions.filters can appear at most once.',
        validate: model => {
            const filters = model?.compositeOptions?.filters || []
            const seen = new Set()
            for (let i = 0; i < filters.length; i++) {
                const type = filters[i]?.type
                if (type && seen.has(type)) {
                    return [{path: `/compositeOptions/filters/${i}/type`, message: `duplicate filter type '${type}'`}]
                }
                if (type) seen.add(type)
            }
            return []
        }
    },
    {
        name: 'hazeFilterRequiresNoSR',
        description: 'compositeOptions.filters cannot include a HAZE filter when corrections includes SR.',
        validate: model => {
            const filters = model?.compositeOptions?.filters || []
            const corrections = model?.compositeOptions?.corrections || []
            if (!filters.some(f => f.type === 'HAZE')) return []
            if (!corrections.includes('SR')) return []
            return [{path: '/compositeOptions/filters', message: 'HAZE filter is incompatible with SR correction'}]
        }
    }
]

module.exports = {rules}
