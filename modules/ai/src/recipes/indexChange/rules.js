// Cross-field validators for indexChange.

const rules = [
    {
        name: 'legendValuesUnique',
        description: 'legend.entries[*].value must be unique — duplicate values would make the categorical change band ambiguous.',
        validate: model => {
            const entries = model?.legend?.entries || []
            const seen = new Map()
            for (let i = 0; i < entries.length; i++) {
                const value = entries[i]?.value
                if (value === undefined) continue
                if (seen.has(value)) {
                    return [{
                        path: `/legend/entries/${i}/value`,
                        message: `duplicate class value ${value} (already used at entry ${seen.get(value)})`
                    }]
                }
                seen.set(value, i)
            }
            return []
        }
    },
    {
        name: 'fromAndToBandsCompatible',
        description: 'fromImage.band and toImage.band must reference comparable index values — typically the same band name. Different bands (e.g. fromImage.band=ndvi vs toImage.band=nbr) produce a meaningless difference.',
        validate: model => {
            const from = model?.fromImage?.band
            const to = model?.toImage?.band
            if (!from || !to) return []
            if (from === to) return []
            return [{
                path: '/toImage/band',
                message: `fromImage.band='${from}' and toImage.band='${to}' should normally be the same — different bands produce a meaningless difference. If this is intentional, ignore.`
            }]
        }
    },
    {
        name: 'errorBandConsistency',
        description: 'fromImage.errorBand and toImage.errorBand must either both be set or both be absent — the recipe needs both errors to compute combined error and confidence; setting only one is silently dropped.',
        validate: model => {
            const fromErr = model?.fromImage?.errorBand
            const toErr = model?.toImage?.errorBand
            const hasFrom = fromErr !== undefined && fromErr !== null && fromErr !== ''
            const hasTo = toErr !== undefined && toErr !== null && toErr !== ''
            if (hasFrom === hasTo) return []
            return [{
                path: hasFrom ? '/toImage/errorBand' : '/fromImage/errorBand',
                message: 'errorBand must be set on BOTH fromImage and toImage, or neither — confidence/error bands are only produced when both sides have an error band'
            }]
        }
    }
]

module.exports = {rules}
