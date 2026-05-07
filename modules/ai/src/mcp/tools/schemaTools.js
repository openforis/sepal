const {bundleSchema} = require('../../recipes/bundleSchema')

const createSchemaTools = ({registry}) => [
    {
        name: 'recipe_info',
        description: 'Get everything needed to construct or modify a recipe of the given type: the parameter schema (JSON Schema with types, enums, required fields, and conditional requirements via if/then), the cross-field validation rules (constraints JSON Schema cannot express — date ordering, value-relative comparisons, etc., each with a name and human-readable description), a populated default recipe model as a starting baseline, and the static output band metadata. Call this once for any recipe type you intend to construct, modify, or reason about — the schema and rules are required to produce valid models.\n\n**Defaults contract.** The returned defaults populate fields that have a sensible recipe-wide baseline (processing options, thresholds, etc.). Fields the LLM is responsible for populating from the user\'s intent — typically AOI, input imagery, legend entries, references to other recipes, target dates, etc. — are intentionally left absent or as empty arrays. The schema\'s `required` and `minItems` mark these gaps. Build your model by deep-copying the defaults, filling in those gaps, and adjusting any other fields the user asked about. Submit the resulting complete model to recipe_create / recipe_save — there is no server-side merge with defaults.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type ID (e.g. RADAR_MOSAIC, MOSAIC, CLASSIFICATION)'}
            },
            required: ['type']
        },
        handler: async ({params}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            const rules = (schema.rules || []).map(r => ({
                name: r.name,
                description: r.description
            }))
            return {
                success: true,
                data: {
                    parameterSchema: bundleSchema(schema.parameterSchema),
                    rules,
                    defaults: schema.getDefaults ? schema.getDefaults() : null,
                    bands: schema.bands || {}
                }
            }
        }
    }
]

module.exports = {createSchemaTools}
