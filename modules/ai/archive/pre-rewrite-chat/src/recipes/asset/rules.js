// Cross-field validators for the asset recipe.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const isYmd = s => typeof s === 'string' && DATE_RE.test(s)

const rules = [
    {
        name: 'fromDateBeforeToDate',
        description: 'When dates.type is YEAR or CUSTOM_DATE_RANGE, dates.fromDate must be strictly before dates.toDate. The interval is half-open: scenes acquired ON toDate are NOT included.',
        validate: model => {
            const dates = model?.dates
            if (!dates || dates.type === 'ALL_DATES') return []
            if (!isYmd(dates.fromDate) || !isYmd(dates.toDate)) return []
            if (dates.fromDate >= dates.toDate) {
                return [{
                    path: '/dates/toDate',
                    message: `must be strictly after dates.fromDate (${dates.fromDate}), got ${dates.toDate}`
                }]
            }
            return []
        }
    },
    {
        name: 'maskBandsExistInAsset',
        description: 'Every mask.constraintsEntries[*].constraints[*].band must reference one of assetDetails.bands[*].id — masks can only constrain bands that actually exist on the asset.',
        validate: model => {
            const validBands = new Set(
                (model?.assetDetails?.bands || []).map(b => b?.id).filter(Boolean)
            )
            if (validBands.size === 0) return []
            const entries = model?.mask?.constraintsEntries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                for (let j = 0; j < constraints.length; j++) {
                    const band = constraints[j]?.band
                    if (band && !validBands.has(band)) {
                        errors.push({
                            path: `/mask/constraintsEntries/${i}/constraints/${j}/band`,
                            message: `'${band}' is not in assetDetails.bands[*].id (available: ${[...validBands].join(', ')})`
                        })
                    }
                }
            }
            return errors
        }
    },
    {
        name: 'filterConstraintsHaveProperty',
        description: 'Every filter.filtersEntries[*].constraints[*] must have a `property` field — filters operate on image metadata properties, not bands.',
        validate: model => {
            const entries = model?.filter?.filtersEntries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                for (let j = 0; j < constraints.length; j++) {
                    const c = constraints[j]
                    if (!c?.property) {
                        errors.push({
                            path: `/filter/filtersEntries/${i}/constraints/${j}/property`,
                            message: 'is required on filter constraints (filter constraints reference image properties, not bands)'
                        })
                    }
                    if (c?.operator === 'class') {
                        errors.push({
                            path: `/filter/filtersEntries/${i}/constraints/${j}/operator`,
                            message: 'class operator is not allowed on filter constraints (image properties are not categorical bands)'
                        })
                    }
                }
            }
            return errors
        }
    },
    {
        name: 'maskConstraintsReferenceThisRecipe',
        description: 'Every mask.constraintsEntries[*].constraints[*] must have image=\'this-recipe\' and a `band` field — masks operate on the asset\'s own band values.',
        validate: model => {
            const entries = model?.mask?.constraintsEntries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                for (let j = 0; j < constraints.length; j++) {
                    const c = constraints[j]
                    if (c?.image && c.image !== 'this-recipe') {
                        errors.push({
                            path: `/mask/constraintsEntries/${i}/constraints/${j}/image`,
                            message: `must be 'this-recipe' (got '${c.image}')`
                        })
                    }
                    if (!c?.band) {
                        errors.push({
                            path: `/mask/constraintsEntries/${i}/constraints/${j}/band`,
                            message: 'is required on mask constraints'
                        })
                    }
                }
            }
            return errors
        }
    },
]

module.exports = {rules}
