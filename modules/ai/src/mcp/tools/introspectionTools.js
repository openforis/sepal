const createIntrospectionTools = ({registry}) => [
    {
        name: 'recipe_types',
        description: 'List all available recipe types with descriptions',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async () => {
            const types = registry.listSchemas().map(s => ({
                id: s.id,
                name: s.name,
                description: s.description
            }))
            return {success: true, data: types}
        }
    },
    {
        name: 'recipe_schema',
        description: 'Get the full parameter schema (JSON Schema) for a specific recipe type',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type ID (e.g. MOSAIC, CLASSIFICATION)'}
            },
            required: ['type']
        },
        handler: async ({params}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            return {success: true, data: schema.parameterSchema}
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
