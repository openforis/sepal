const {bundleSchema} = require('../../recipes/bundleSchema')

const createSchemaTools = ({registry}) => [
    {
        name: 'recipe_info',
        description: 'Get everything needed to construct or modify a recipe of the given type: the parameter schema (JSON Schema with types, enums, required fields, and conditional requirements via if/then), the cross-field validation rules (constraints JSON Schema cannot express — date ordering, value-relative comparisons, etc., each with a name and human-readable description), a populated default recipe model as a starting baseline (sensible defaults for everything except aoi, which the user must fill in), and the static output band metadata. Call this once for any recipe type you intend to construct, modify, or reason about — the schema and rules are required to produce valid models.',
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
