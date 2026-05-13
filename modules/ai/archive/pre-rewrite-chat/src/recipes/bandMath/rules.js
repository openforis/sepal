// Cross-field validators for bandMath.

const RESERVED_NAMES = new Set([
    'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2'
])

const rules = [
    {
        name: 'imageIdsUnique',
        description: 'inputImagery.images[*].imageId must be unique — calculations reference images via imageId, and duplicates would resolve unpredictably.',
        validate: model => {
            const images = model?.inputImagery?.images || []
            const seen = new Map()
            for (let i = 0; i < images.length; i++) {
                const id = images[i]?.imageId
                if (id && seen.has(id)) {
                    return [{
                        path: `/inputImagery/images/${i}/imageId`,
                        message: `duplicate imageId '${id}' (already at image ${seen.get(id)})`
                    }]
                }
                if (id) seen.set(id, i)
            }
            return []
        }
    },
    {
        name: 'imageNamesUnique',
        description: 'inputImagery.images[*].name plus calculations.calculations[*].name must collectively be unique — expressions reference images/calculations by name; duplicates make references ambiguous.',
        validate: model => {
            const images = model?.inputImagery?.images || []
            const calcs = model?.calculations?.calculations || []
            const seen = new Map()
            const errors = []
            for (let i = 0; i < images.length; i++) {
                const name = images[i]?.name
                if (!name) continue
                if (seen.has(name)) {
                    errors.push({path: `/inputImagery/images/${i}/name`, message: `duplicate name '${name}' (already at ${seen.get(name)})`})
                } else {
                    seen.set(name, `/inputImagery/images/${i}`)
                }
            }
            for (let i = 0; i < calcs.length; i++) {
                const name = calcs[i]?.name
                if (!name) continue
                if (seen.has(name)) {
                    errors.push({path: `/calculations/calculations/${i}/name`, message: `duplicate name '${name}' (already at ${seen.get(name)})`})
                } else {
                    seen.set(name, `/calculations/calculations/${i}`)
                }
            }
            return errors
        }
    },
    {
        name: 'calculationNameNotReserved',
        description: 'calculations.calculations[*].name must not collide with reserved math constants (E, LN10, LN2, LOG10E, LOG2E, PI, SQRT1_2, SQRT2) — these are auto-injected into expression scope and would shadow.',
        validate: model => {
            const calcs = model?.calculations?.calculations || []
            const errors = []
            for (let i = 0; i < calcs.length; i++) {
                const name = calcs[i]?.name
                if (name && RESERVED_NAMES.has(name)) {
                    errors.push({path: `/calculations/calculations/${i}/name`, message: `'${name}' is a reserved math constant`})
                }
            }
            return errors
        }
    },
    {
        name: 'usedBandsReferenceKnownImages',
        description: 'Every calculations.calculations[*].usedBands[*].imageId must match an inputImagery.images[*].imageId or another calculation\'s imageId.',
        validate: model => {
            const validIds = new Set([
                ...(model?.inputImagery?.images || []).map(i => i?.imageId),
                ...(model?.calculations?.calculations || []).map(c => c?.imageId)
            ].filter(Boolean))
            if (validIds.size === 0) return []
            const calcs = model?.calculations?.calculations || []
            const errors = []
            for (let i = 0; i < calcs.length; i++) {
                const usedBands = calcs[i]?.usedBands || []
                for (let j = 0; j < usedBands.length; j++) {
                    const id = usedBands[j]?.imageId
                    if (id && !validIds.has(id)) {
                        errors.push({
                            path: `/calculations/calculations/${i}/usedBands/${j}/imageId`,
                            message: `'${id}' is not a known imageId`
                        })
                    }
                }
            }
            return errors
        }
    },
    {
        name: 'outputImagesReferenceKnownCalculations',
        description: 'Every outputBands.outputImages[*].imageId must match a calculations.calculations[*].imageId — only calculation outputs can be exposed.',
        validate: model => {
            const calcIds = new Set((model?.calculations?.calculations || []).map(c => c?.imageId).filter(Boolean))
            if (calcIds.size === 0) return []
            const outs = model?.outputBands?.outputImages || []
            const errors = []
            for (let i = 0; i < outs.length; i++) {
                const id = outs[i]?.imageId
                if (id && !calcIds.has(id)) {
                    errors.push({
                        path: `/outputBands/outputImages/${i}/imageId`,
                        message: `'${id}' does not match any calculations.calculations[*].imageId`
                    })
                }
            }
            return errors
        }
    }
]

module.exports = {rules}
