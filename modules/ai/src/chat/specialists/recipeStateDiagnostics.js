const MAX_SUMMARY_CHARS = 1600

function handleValuesSummary(values) {
    return valueSummary(values)
}

function recipeStateSummary(model) {
    const sources = model?.sources || {}
    const composite = model?.compositeOptions || {}
    const sceneSelection = model?.sceneSelectionOptions || {}
    const dates = model?.dates || {}
    return {
        datasets: dataSetsSummary(sources.dataSets),
        sceneCloudLimit: sources.cloudPercentageThreshold,
        dates: {
            targetDate: dates.targetDate,
            seasonStart: dates.seasonStart,
            seasonEnd: dates.seasonEnd,
            yearsBefore: dates.yearsBefore,
            yearsAfter: dates.yearsAfter
        },
        sceneSelection: {
            type: sceneSelection.type,
            targetDateWeight: sceneSelection.targetDateWeight
        },
        corrections: composite.corrections,
        cloudMethods: composite.includedCloudMasking,
        cloudSettings: {
            sepalCloudScoreMax: composite.sepalCloudScoreMaxCloudProbability,
            s2CloudScoreBand: composite.sentinel2CloudScorePlusBand,
            s2CloudScoreMax: composite.sentinel2CloudScorePlusMaxCloudProbability,
            s2CloudProbabilityMax: composite.sentinel2CloudProbabilityMaxCloudProbability,
            landsatCloudMask: composite.landsatCFMaskCloudMasking,
            landsatShadowMask: composite.landsatCFMaskCloudShadowMasking,
            landsatCirrusMask: composite.landsatCFMaskCirrusMasking,
            landsatDilatedCloud: composite.landsatCFMaskDilatedCloud
        },
        performance: {
            filters: filtersSummary(composite.filters),
            cloudBuffer: composite.cloudBuffer,
            snowMasking: composite.snowMasking,
            compose: composite.compose,
            tileOverlap: composite.tileOverlap,
            orbitOverlap: composite.orbitOverlap,
            brdfMultiplier: composite.brdfMultiplier
        }
    }
}

function compactJson(value, maxChars = MAX_SUMMARY_CHARS) {
    return truncate(JSON.stringify(value), maxChars)
}

function valueSummary(value) {
    if (Array.isArray(value)) {
        if (value.every(isScalar)) return value
        return value.map(entry => valueSummary(entry))
    }
    if (!value || typeof value !== 'object') return value
    const entries = Object.entries(value)
    if (isDataSetsShape(entries)) return dataSetsSummary(value)
    return Object.fromEntries(entries.map(([key, nested]) => [key, nestedValueSummary(key, nested)]))
}

function nestedValueSummary(key, value) {
    if (key === 'datasets' && value && typeof value === 'object' && isDataSetsShape(Object.entries(value))) {
        return dataSetsSummary(value)
    }
    if (Array.isArray(value)) return value.length <= 8 && value.every(isScalar) ? value : {type: 'array', length: value.length}
    if (!value || typeof value !== 'object') return value
    return {type: 'object', keys: Object.keys(value).sort()}
}

function dataSetsSummary(dataSets) {
    if (!dataSets || typeof dataSets !== 'object') return dataSets
    return Object.fromEntries(Object.entries(dataSets).map(([group, datasets]) => [
        group,
        Array.isArray(datasets) ? datasets : nestedValueSummary(group, datasets)
    ]))
}

function filtersSummary(filters) {
    if (!Array.isArray(filters)) return filters
    return filters.map(filter => ({
        type: filter?.type,
        percentile: filter?.percentile
    }))
}

function isDataSetsShape(entries) {
    return entries.length > 0 && entries.every(([, value]) => Array.isArray(value) && value.every(isScalar))
}

function isScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function truncate(value, maxChars) {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`
}

export {compactJson, handleValuesSummary, recipeStateSummary}
