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
        description: 'targetDate must be on or after 1982-08-22, the Landsat 4 launch date. Future targetDates are allowed.',
        paths: ['/dates/targetDate'],
        subjectPaths: ['/dates/targetDate'],
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
        description: 'seasonStart must be between targetDate - 1 year + 1 day and targetDate.',
        paths: ['/dates/targetDate', '/dates/seasonStart'],
        subjectPaths: ['/dates/targetDate', '/dates/seasonStart'],
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
        description: 'seasonEnd must be between targetDate + 1 day and targetDate + 1 year.',
        paths: ['/dates/targetDate', '/dates/seasonEnd'],
        subjectPaths: ['/dates/targetDate', '/dates/seasonEnd'],
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
        description: 'corrections cannot include both surface reflectance and cross-sensor calibration.',
        paths: ['/compositeOptions/corrections'],
        subjectPaths: ['/compositeOptions/corrections'],
        validate: model => {
            const corrections = model?.compositeOptions?.corrections || []
            if (corrections.includes('SR') && corrections.includes('CALIBRATE')) {
                return [{path: '/compositeOptions/corrections', message: 'surface reflectance and cross-sensor calibration are mutually exclusive'}]
            }
            return []
        }
    },
    {
        name: 'calibrateRequiresMultipleSources',
        description: 'cross-sensor calibration is only valid when both Landsat and Sentinel-2 source groups are selected.',
        paths: ['/compositeOptions/corrections', '/sources/dataSets'],
        subjectPaths: ['/compositeOptions/corrections'],
        validate: model => {
            const corrections = model?.compositeOptions?.corrections || []
            if (!corrections.includes('CALIBRATE')) return []
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (groups.includes('LANDSAT') && groups.includes('SENTINEL_2')) return []
            return [{path: '/compositeOptions/corrections', message: 'cross-sensor calibration requires both Landsat and Sentinel-2 source groups'}]
        }
    },
    {
        name: 'mixedSourcesRequireSrOrCalibrate',
        description: 'When Landsat and Sentinel-2 source groups are both selected, corrections must include surface reflectance or cross-sensor calibration.',
        paths: ['/sources/dataSets', '/compositeOptions/corrections'],
        subjectPaths: ['/compositeOptions/corrections'],
        validate: model => {
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (!(groups.includes('LANDSAT') && groups.includes('SENTINEL_2'))) return []
            const corrections = model?.compositeOptions?.corrections || []
            if (corrections.includes('SR') || corrections.includes('CALIBRATE')) return []
            return [{path: '/compositeOptions/corrections', message: 'surface reflectance or cross-sensor calibration is required when both Landsat and Sentinel-2 source groups are selected'}]
        }
    },
    {
        name: 'multipleSourcesRequireAllScenes',
        description: 'When Landsat and Sentinel-2 source groups are both selected, scene selection must use all scenes.',
        paths: ['/sources/dataSets', '/sceneSelectionOptions/type'],
        subjectPaths: ['/sceneSelectionOptions/type'],
        validate: model => {
            const groups = Object.keys(model?.sources?.dataSets || {})
            if (!(groups.includes('LANDSAT') && groups.includes('SENTINEL_2'))) return []
            const type = model?.sceneSelectionOptions?.type
            if (type === 'ALL') return []
            return [{path: '/sceneSelectionOptions/type', message: 'must use all scenes when both Landsat and Sentinel-2 source groups are selected'}]
        }
    },
    {
        name: 'cloudMaskingMethodAvailability',
        description: 'Cloud-mask methods have source requirements: Landsat CFMask needs Landsat; Sentinel-2 Cloud Score+ and Sentinel-2 Cloud Probability need Sentinel-2; PINO26 needs Sentinel-2 only and no surface reflectance correction.',
        paths: ['/compositeOptions/includedCloudMasking', '/sources/dataSets', '/compositeOptions/corrections'],
        subjectPaths: ['/compositeOptions/includedCloudMasking'],
        validate: model => {
            const included = model?.compositeOptions?.includedCloudMasking || []
            const groups = Object.keys(model?.sources?.dataSets || {})
            const hasLandsat = groups.includes('LANDSAT')
            const hasSentinel2 = groups.includes('SENTINEL_2')
            const hasSR = (model?.compositeOptions?.corrections || []).includes('SR')
            const errors = []
            if (included.includes('landsatCFMask') && !hasLandsat) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'Landsat CFMask requires a Landsat source group'})
            }
            if (included.includes('sentinel2CloudScorePlus') && !hasSentinel2) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'Sentinel-2 Cloud Score+ requires a Sentinel-2 source group'})
            }
            if (included.includes('sentinel2CloudProbability') && !hasSentinel2) {
                errors.push({path: '/compositeOptions/includedCloudMasking', message: 'Sentinel-2 Cloud Probability requires a Sentinel-2 source group'})
            }
            if (included.includes('pino26')) {
                if (hasLandsat || !hasSentinel2) {
                    errors.push({path: '/compositeOptions/includedCloudMasking', message: 'PINO26 requires Sentinel-2 only, with no Landsat source group'})
                }
                if (hasSR) {
                    errors.push({path: '/compositeOptions/includedCloudMasking', message: 'PINO26 cannot be combined with surface reflectance correction'})
                }
            }
            return errors
        }
    },
    {
        name: 'filterTypesUnique',
        description: 'Each filter type in compositeOptions.filters can appear at most once.',
        paths: ['/compositeOptions/filters'],
        subjectPaths: ['/compositeOptions/filters'],
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
        description: 'compositeOptions.filters cannot include a haze filter when corrections include surface reflectance.',
        paths: ['/compositeOptions/filters', '/compositeOptions/corrections'],
        subjectPaths: ['/compositeOptions/filters'],
        validate: model => {
            const filters = model?.compositeOptions?.filters || []
            const corrections = model?.compositeOptions?.corrections || []
            if (!filters.some(f => f.type === 'HAZE')) return []
            if (!corrections.includes('SR')) return []
            return [{path: '/compositeOptions/filters', message: 'haze filter is incompatible with surface reflectance correction'}]
        }
    }
]

module.exports = {rules}
