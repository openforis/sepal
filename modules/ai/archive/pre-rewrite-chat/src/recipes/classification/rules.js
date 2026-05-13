// Cross-field validators for classification. Constraints that JSON Schema
// cannot express live here.

const rules = [
    {
        name: 'legendValuesUnique',
        description: 'legend.entries[*].value must be unique — every distinct integer in the training data corresponds to one legend entry, so duplicate values would make class membership ambiguous.',
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
        name: 'oneClassSvmRequiresExactlyTwoClasses',
        description: 'When classifier.type is SVM and classifier.svmType is ONE_CLASS, legend.entries must contain exactly 2 entries — one-class SVM is a binary novelty detector that distinguishes the positive class from everything else.',
        validate: model => {
            const c = model?.classifier
            if (c?.type !== 'SVM' || c?.svmType !== 'ONE_CLASS') return []
            const entries = model?.legend?.entries || []
            if (entries.length === 2) return []
            return [{
                path: '/legend/entries',
                message: `ONE_CLASS SVM requires exactly 2 legend entries (got ${entries.length})`
            }]
        }
    },
    {
        name: 'oneClassValueMatchesLegend',
        description: 'When classifier.type is SVM and classifier.svmType is ONE_CLASS, classifier.oneClass must equal one of the legend entries\' value — it identifies the positive class.',
        validate: model => {
            const c = model?.classifier
            if (c?.type !== 'SVM' || c?.svmType !== 'ONE_CLASS') return []
            const oneClass = c?.oneClass
            if (oneClass === undefined) return []
            const values = (model?.legend?.entries || []).map(e => e?.value)
            if (values.includes(oneClass)) return []
            return [{
                path: '/classifier/oneClass',
                message: `must match a legend.entries[*].value (got ${oneClass}, available: ${values.join(', ')})`
            }]
        }
    },
    {
        name: 'referenceDataClassesInLegend',
        description: 'Every reference-point class in trainingData.dataSets[*].referenceData must correspond to a legend.entries[*].value — points labeled with classes not in the legend cannot be trained against.',
        validate: model => {
            const legendValues = new Set((model?.legend?.entries || []).map(e => e?.value))
            if (legendValues.size === 0) return []
            const dataSets = model?.trainingData?.dataSets || []
            const errors = []
            for (let i = 0; i < dataSets.length; i++) {
                const points = dataSets[i]?.referenceData || []
                for (let j = 0; j < points.length; j++) {
                    const cls = points[j]?.class
                    if (cls === undefined) continue
                    if (!legendValues.has(cls)) {
                        errors.push({
                            path: `/trainingData/dataSets/${i}/referenceData/${j}/class`,
                            message: `class ${cls} is not in the legend`
                        })
                        // Surface only the first offending point per data set —
                        // a single typo otherwise floods the error list.
                        break
                    }
                }
            }
            return errors
        }
    },
]

module.exports = {rules}
