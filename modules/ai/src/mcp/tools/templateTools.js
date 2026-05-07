const _ = require('lodash')

const createTemplateTools = ({registry, recipeClient, recipeValidator}) => [
    {
        name: 'template_list',
        description: 'List available pre-built recipe templates, optionally filtered by type or tags',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Filter by recipe type (e.g. MOSAIC)'},
                tags: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Filter by tags (e.g. ["landsat", "annual"])'
                }
            }
        },
        handler: async ({params}) => {
            const templates = registry.listTemplates(params)
            const summaries = templates.map(t => ({
                id: t.id,
                recipeType: t.recipeType,
                name: t.name,
                description: t.description,
                tags: t.tags,
                requiredOverrides: t.requiredOverrides
            }))
            return {success: true, data: summaries}
        }
    },
    {
        name: 'template_apply',
        description: 'Create a recipe from a pre-built template with parameter overrides. Required overrides (like AOI) must be provided.',
        parameters: {
            type: 'object',
            properties: {
                templateId: {type: 'string', description: 'Template ID'},
                overrides: {type: 'object', description: 'Parameter overrides to merge into the template model'},
                name: {type: 'string', description: 'Name for the new recipe (defaults to template name)'},
                projectId: {type: 'string', description: 'Project to place the recipe in'}
            },
            required: ['templateId', 'overrides']
        },
        handler: async ({username, params}) => {
            const template = registry.getTemplate(params.templateId)
            if (!template) {
                return {success: false, error: {code: 'UNKNOWN_TEMPLATE', message: `Unknown template: ${params.templateId}`}}
            }

            // Check required overrides
            const missing = (template.requiredOverrides || []).filter(key => !params.overrides[key])
            if (missing.length > 0) {
                return {
                    success: false,
                    error: {
                        code: 'MISSING_OVERRIDES',
                        message: `Required overrides missing: ${missing.join(', ')}`
                    }
                }
            }

            let model = _.merge({}, template.model, params.overrides)
            if (recipeValidator) {
                const errors = recipeValidator.validateModel({type: template.recipeType, model})
                if (errors) {
                    return {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: `Recipe model validation failed:\n${errors.join('\n')}`
                        }
                    }
                }
            }
            const result = await recipeClient.saveRecipe({
                username,
                type: template.recipeType,
                name: params.name || template.name,
                projectId: params.projectId,
                model
            })
            return {success: true, data: result}
        }
    }
]

module.exports = {createTemplateTools}
