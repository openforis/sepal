// Cross-field validators for stack.

const rules = [
    {
        name: 'imageIdsUnique',
        description: 'inputImagery.images[*].imageId must be unique — bandNames entries reference images by imageId.',
        validate: model => {
            const images = model?.inputImagery?.images || []
            const seen = new Map()
            for (let i = 0; i < images.length; i++) {
                const id = images[i]?.imageId
                if (id && seen.has(id)) {
                    return [{path: `/inputImagery/images/${i}/imageId`, message: `duplicate imageId '${id}' (already at image ${seen.get(id)})`}]
                }
                if (id) seen.set(id, i)
            }
            return []
        }
    },
    {
        name: 'bandNamesEntryReferencesImage',
        description: 'Every bandNames.bandNames[*].imageId must match an inputImagery.images[*].imageId.',
        validate: model => {
            const validIds = new Set((model?.inputImagery?.images || []).map(i => i?.imageId).filter(Boolean))
            if (validIds.size === 0) return []
            const entries = model?.bandNames?.bandNames || []
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const id = entries[i]?.imageId
                if (id && !validIds.has(id)) {
                    errors.push({
                        path: `/bandNames/bandNames/${i}/imageId`,
                        message: `'${id}' does not match any inputImagery.images[*].imageId`
                    })
                }
            }
            return errors
        }
    },
    {
        name: 'outputNamesUnique',
        description: 'Every bandNames.bandNames[*].bands[*].outputName must be globally unique across the stack — duplicate output names would collide on `select(originalNames, outputNames)`.',
        validate: model => {
            const entries = model?.bandNames?.bandNames || []
            const seen = new Map()
            const errors = []
            for (let i = 0; i < entries.length; i++) {
                const bands = entries[i]?.bands || []
                for (let j = 0; j < bands.length; j++) {
                    const out = bands[j]?.outputName
                    if (!out) continue
                    if (seen.has(out)) {
                        const [pi, pj] = seen.get(out)
                        errors.push({
                            path: `/bandNames/bandNames/${i}/bands/${j}/outputName`,
                            message: `duplicate outputName '${out}' (already at /bandNames/bandNames/${pi}/bands/${pj})`
                        })
                    } else {
                        seen.set(out, [i, j])
                    }
                }
            }
            return errors
        }
    }
]

module.exports = {rules}
