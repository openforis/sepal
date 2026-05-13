// Cross-field validators for remapping.

const rules = [
    {
        name: 'legendValuesUnique',
        description: 'legend.entries[*].value must be unique — duplicate values would make the output `class` band ambiguous (a pixel matching two entries with the same value couldn\'t tell them apart anyway).',
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
        name: 'inputImageIdsUnique',
        description: 'inputImagery.images[*].imageId must be unique — constraints reference images by imageId; duplicates would resolve unpredictably.',
        validate: model => {
            const images = model?.inputImagery?.images || []
            const seen = new Map()
            for (let i = 0; i < images.length; i++) {
                const imageId = images[i]?.imageId
                if (!imageId) continue
                if (seen.has(imageId)) {
                    return [{
                        path: `/inputImagery/images/${i}/imageId`,
                        message: `duplicate imageId '${imageId}' (already used at image ${seen.get(imageId)})`
                    }]
                }
                seen.set(imageId, i)
            }
            return []
        }
    },
    {
        name: 'constraintImageReferencesInput',
        description: 'Every legend.entries[*].constraints[*].image must match the imageId of one of inputImagery.images — constraints can only reference declared input images.',
        validate: model => {
            const validImageIds = new Set(
                (model?.inputImagery?.images || []).map(i => i?.imageId).filter(Boolean)
            )
            if (validImageIds.size === 0) return []
            const entries = model?.legend?.entries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                for (let j = 0; j < constraints.length; j++) {
                    const image = constraints[j]?.image
                    if (image && !validImageIds.has(image)) {
                        errors.push({
                            path: `/legend/entries/${i}/constraints/${j}/image`,
                            message: `'${image}' does not match any inputImagery.images[*].imageId`
                        })
                    }
                }
            }
            return errors
        }
    },
    {
        name: 'constraintBandIncluded',
        description: 'Every constraint\'s band must appear in the referenced input image\'s includedBands — only declared bands are available to constraint expressions.',
        validate: model => {
            const includedByImage = {}
            for (const image of model?.inputImagery?.images || []) {
                if (image?.imageId) {
                    includedByImage[image.imageId] = new Set(
                        (image.includedBands || []).map(b => b?.band).filter(Boolean)
                    )
                }
            }
            const entries = model?.legend?.entries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                for (let j = 0; j < constraints.length; j++) {
                    const c = constraints[j]
                    const included = includedByImage[c?.image]
                    if (!included) continue  // already flagged by constraintImageReferencesInput
                    if (c?.band && !included.has(c.band)) {
                        errors.push({
                            path: `/legend/entries/${i}/constraints/${j}/band`,
                            message: `'${c.band}' is not in inputImagery.images[imageId='${c.image}'].includedBands`
                        })
                    }
                }
            }
            return errors
        }
    },
    {
        name: 'multipleConstraintsRequireBooleanOperator',
        description: 'When legend.entries[*].constraints has 2 or more entries, booleanOperator (\'and\' or \'or\') must be set so the constraints can be combined.',
        validate: model => {
            const entries = model?.legend?.entries || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const constraints = entries[i]?.constraints || []
                if (constraints.length >= 2 && !entries[i]?.booleanOperator) {
                    errors.push({
                        path: `/legend/entries/${i}/booleanOperator`,
                        message: 'is required when constraints has 2 or more entries'
                    })
                }
            }
            return errors
        }
    }
]

module.exports = {rules}
