const Ajv = require('ajv')

const visParamsSchema = {
    type: 'object',
    properties: {
        type: {enum: ['rgb', 'hsv', 'continuous', 'categorical']},
        bands: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 3},
        min: {type: 'array', items: {type: 'number'}},
        max: {type: 'array', items: {type: 'number'}},
        gamma: {type: 'array', items: {type: 'number'}},
        palette: {type: 'array', items: {type: 'string'}, minItems: 1},
        inverted: {type: 'array', items: {type: 'boolean'}},
        values: {type: 'array', items: {type: 'number'}, minItems: 1},
        labels: {type: 'array', items: {type: 'string'}, minItems: 1}
    },
    required: ['type', 'bands'],
    allOf: [
        {
            if: {properties: {type: {const: 'rgb'}}, required: ['type']},
            then: {
                properties: {
                    bands: {minItems: 3, maxItems: 3},
                    min: {minItems: 3, maxItems: 3},
                    max: {minItems: 3, maxItems: 3}
                },
                required: ['min', 'max']
            }
        },
        {
            if: {properties: {type: {const: 'hsv'}}, required: ['type']},
            then: {
                properties: {
                    bands: {minItems: 3, maxItems: 3},
                    min: {minItems: 3, maxItems: 3},
                    max: {minItems: 3, maxItems: 3}
                },
                required: ['min', 'max']
            }
        },
        {
            if: {properties: {type: {const: 'continuous'}}, required: ['type']},
            then: {
                properties: {
                    bands: {minItems: 1, maxItems: 1},
                    min: {minItems: 1, maxItems: 1},
                    max: {minItems: 1, maxItems: 1}
                },
                required: ['min', 'max', 'palette']
            }
        },
        {
            if: {properties: {type: {const: 'categorical'}}, required: ['type']},
            then: {
                properties: {bands: {minItems: 1, maxItems: 1}},
                required: ['values', 'labels', 'palette']
            }
        }
    ]
}

const ajv = new Ajv({strict: false, allErrors: true})
const validateSchema = ajv.compile(visParamsSchema)

const createVisParamsValidator = () => ({
    validate: visParams => {
        const errors = []
        if (!validateSchema(visParams || {})) {
            for (const e of validateSchema.errors) {
                // Suppress the meta-error Ajv emits for every failed `if/then`
                // branch — the concrete failures it groups are already in the list.
                if (e.keyword === 'if') continue
                errors.push(`${e.instancePath || '/'} ${e.message}`)
            }
        }
        if (visParams?.type === 'categorical') {
            const {values, labels, palette} = visParams
            if (Array.isArray(values) && Array.isArray(palette) && values.length !== palette.length) {
                errors.push(`/palette length must equal /values length (${palette.length} vs ${values.length})`)
            }
            if (Array.isArray(values) && Array.isArray(labels) && values.length !== labels.length) {
                errors.push(`/labels length must equal /values length (${labels.length} vs ${values.length})`)
            }
        }
        return errors
    }
})

module.exports = {createVisParamsValidator}
