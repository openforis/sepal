const {bundleSchema} = require('../../recipes/bundleSchema')

const createIntrospectionTools = ({registry}) => [
    {
        name: 'recipe_schema',
        description: 'Get the full parameter schema for a recipe type, plus the cross-field validation rules. The schema (JSON Schema) describes the structural constraints — types, enums, required fields, conditional requirements via if/then. The rules describe cross-field constraints that JSON Schema cannot express (date ordering, value-relative comparisons, etc.); each rule has a name and a human-readable description of what it enforces.',
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
            return {success: true, data: {parameterSchema: bundleSchema(schema.parameterSchema), rules}}
        }
    },
    {
        name: 'recipe_defaults',
        description: 'Get a populated default recipe model for a recipe type. Returns a complete starting baseline — all options filled in with sensible defaults, dates set to a reasonable interval — that the LLM can tweak rather than build from scratch. Required fields without sensible defaults (typically `aoi`) are not included; the LLM must fill those in based on user input.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type ID'}
            },
            required: ['type']
        },
        handler: async ({params}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            if (!schema.getDefaults) {
                return {success: false, error: {code: 'NO_DEFAULTS', message: `Recipe type ${params.type} has no defaults defined`}}
            }
            return {success: true, data: schema.getDefaults()}
        }
    },
    {
        name: 'recipe_bands',
        description: 'Get available output bands for a recipe type. Returns static band metadata from the schema registry.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type ID'}
            },
            required: ['type']
        },
        handler: async ({params}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            return {success: true, data: schema.bands || {}}
        }
    },
    {
        name: 'recipe_visualizations',
        description: 'Get preset visualizations for a recipe type. Returns static visualization presets from the schema registry.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type ID'}
            },
            required: ['type']
        },
        handler: async ({params}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            return {success: true, data: schema.visualizations || []}
        }
    }
]

module.exports = {createIntrospectionTools}
