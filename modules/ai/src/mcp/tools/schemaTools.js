const {bundleSchema} = require('../../recipes/bundleSchema')

const createSchemaTools = ({registry}) => [
    {
        name: 'recipe_info',
        description: 'Get everything to construct/modify a recipe of the given type: parameter schema (JSON Schema with types, enums, required fields, conditional `if/then`), cross-field rules (constraints JSON Schema can\'t express — date ordering, value-relative comparisons; each with name + description), default model baseline, output band metadata. Call once per recipe type before construction.\n\n**Defaults contract.** Defaults populate fields with sensible baselines (processing options, thresholds). Fields the LLM must fill from user intent (AOI, input imagery, legend entries, recipe refs, target dates) are absent or empty arrays — the schema\'s `required` and `minItems` mark them. Workflow: deep-copy defaults → fill gaps → adjust per request → submit full model to recipe_create / recipe_save. **No server-side merge.** Keep fields at default unless there\'s reason to change.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', enum: registry.listSchemas().map(s => s.id), description: 'Recipe type id.'}
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
