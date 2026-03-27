const Ajv = require('ajv')
const log = require('#sepal/log').getLogger('validation')

const ajv = new Ajv({allErrors: true, strict: false})

/**
 * Deep-merge defaults into a model, only filling in missing keys.
 * User-provided arrays replace defaults entirely (no array merging).
 */
const deepMergeDefaults = (defaults, overrides) => {
    if (overrides === undefined || overrides === null) {
        return defaults
    }
    if (typeof defaults !== 'object' || Array.isArray(defaults)) {
        return overrides
    }
    if (typeof overrides !== 'object' || Array.isArray(overrides)) {
        return overrides
    }
    const result = {...defaults}
    for (const key of Object.keys(overrides)) {
        if (key in result && typeof result[key] === 'object' && !Array.isArray(result[key])
            && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
            && overrides[key] !== null) {
            result[key] = deepMergeDefaults(result[key], overrides[key])
        } else {
            result[key] = overrides[key]
        }
    }
    return result
}

const yearFromDate = dateStr => {
    const match = dateStr && dateStr.match(/^(\d{4})-/)
    return match ? parseInt(match[1]) : null
}

const validateDataSetAvailability = (allDataSets, dates, dataSetAvailability) => {
    if (!dataSetAvailability || !dates) return []
    const seasonStartYear = yearFromDate(dates.seasonStart)
    const seasonEndYear = yearFromDate(dates.seasonEnd)
    if (seasonStartYear === null || seasonEndYear === null) return []

    const fromYear = seasonStartYear - (dates.yearsBefore || 0)
    const toYear = seasonEndYear + (dates.yearsAfter || 0)
    const errors = []
    for (const dataSetId of allDataSets) {
        const ds = dataSetAvailability[dataSetId]
        if (!ds) continue
        const startOk = !ds.toYear || fromYear <= ds.toYear
        const endOk = toYear >= ds.fromYear
        if (!startOk || !endOk) {
            const range = ds.toYear ? `${ds.fromYear}-${ds.toYear}` : `${ds.fromYear}+`
            errors.push(`${ds.name} (${range}) has no data in the selected date range (${fromYear}-${toYear})`)
        }
    }
    return errors
}

const validateMosaicModel = (model, schema) => {
    const errors = []
    const dataSets = (model.sources && model.sources.dataSets) || {}
    const sourceGroups = Object.keys(dataSets)
    const corrections = (model.compositeOptions && model.compositeOptions.corrections) || []
    const includedCloudMasking = (model.compositeOptions && model.compositeOptions.includedCloudMasking) || []
    const filters = (model.compositeOptions && model.compositeOptions.filters) || []
    const hasLandsat = sourceGroups.includes('LANDSAT')
    const hasSentinel2 = sourceGroups.includes('SENTINEL_2')
    const hasSR = corrections.includes('SR')

    // At least one dataset must be selected
    const allDataSets = Object.values(dataSets).flat()
    if (allDataSets.length === 0) {
        errors.push('At least one dataset must be selected in sources.dataSets')
    }

    // CALIBRATE requires multiple source groups AND no SR
    if (corrections.includes('CALIBRATE')) {
        if (sourceGroups.length < 2) {
            errors.push('CALIBRATE correction requires multiple source groups (both LANDSAT and SENTINEL_2)')
        }
        if (hasSR) {
            errors.push('CALIBRATE correction cannot be used with SR (Surface Reflectance) correction')
        }
    }

    // SELECT scene selection requires single source group
    if (model.sceneSelectionOptions && model.sceneSelectionOptions.type === 'SELECT') {
        if (sourceGroups.length > 1) {
            errors.push('SELECT scene selection is only available with a single source group (either LANDSAT or SENTINEL_2, not both)')
        }
    }

    // pino26 cloud masking requires Sentinel-2 only + no SR
    if (includedCloudMasking.includes('pino26')) {
        if (hasLandsat || !hasSentinel2) {
            errors.push('pino26 cloud masking requires Sentinel-2 as the only data source (no LANDSAT)')
        }
        if (hasSR) {
            errors.push('pino26 cloud masking requires TOA data (no SR correction)')
        }
    }

    // sentinel2* cloud masking requires SENTINEL_2 in sources
    if (includedCloudMasking.includes('sentinel2CloudScorePlus') || includedCloudMasking.includes('sentinel2CloudProbability')) {
        if (!hasSentinel2) {
            errors.push('Sentinel-2 cloud masking methods require SENTINEL_2 in data sources')
        }
    }

    // landsatCFMask requires LANDSAT in sources
    if (includedCloudMasking.includes('landsatCFMask')) {
        if (!hasLandsat) {
            errors.push('landsatCFMask cloud masking requires LANDSAT in data sources')
        }
    }

    // HAZE filter incompatible with SR
    const hazeFilter = filters.find(f => f.type === 'HAZE')
    if (hazeFilter && hasSR) {
        errors.push('HAZE filter is not available with SR (Surface Reflectance) correction')
    }

    // brdfMultiplier must be set if BRDF correction is enabled
    if (corrections.includes('BRDF')) {
        const multiplier = model.compositeOptions && model.compositeOptions.brdfMultiplier
        if (multiplier !== undefined && multiplier !== null && multiplier <= 0) {
            errors.push('brdfMultiplier must be greater than 0 when BRDF correction is enabled')
        }
    }

    // Dataset availability vs date range
    if (schema && schema.dataSetAvailability && model.dates && allDataSets.length > 0) {
        errors.push(...validateDataSetAvailability(allDataSets, model.dates, schema.dataSetAvailability))
    }

    return errors
}

const crossFieldValidators = {
    MOSAIC: validateMosaicModel
}

const createRecipeValidator = ({registry}) => {
    const schemaValidators = {}

    const getSchemaValidator = type => {
        if (!schemaValidators[type]) {
            const schema = registry.getSchema(type)
            if (schema && schema.parameterSchema) {
                schemaValidators[type] = ajv.compile(schema.parameterSchema)
            }
        }
        return schemaValidators[type] || null
    }

    const validateModel = ({type, model}) => {
        const errors = []

        // Phase 1: JSON Schema validation
        const validate = getSchemaValidator(type)
        if (validate && !validate(model)) {
            errors.push(
                ...validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`)
            )
        }

        // Phase 2: Cross-field validation
        const schema = registry.getSchema(type)
        const crossFieldValidator = crossFieldValidators[type]
        if (crossFieldValidator) {
            errors.push(...crossFieldValidator(model, schema))
        }

        if (errors.length > 0) {
            log.debug(`Validation failed for ${type}: ${errors.join('; ')}`)
            return errors
        }
        return null
    }

    const applyDefaults = ({type, model}) => {
        const schema = registry.getSchema(type)
        if (schema && schema.getDefaults) {
            return deepMergeDefaults(schema.getDefaults(), model)
        }
        return model
    }

    return {validateModel, applyDefaults}
}

module.exports = {createRecipeValidator, deepMergeDefaults}
