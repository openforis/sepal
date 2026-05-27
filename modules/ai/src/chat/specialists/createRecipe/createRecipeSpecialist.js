const {specialistPrompt} = require('../../llmText/prompts')
const {createSpecialistRuntime} = require('../runSpecialist')
const {scopeInnerTools} = require('../specialistScope')

const ALLOWED_INNER_TOOLS = ['create_recipe_values', 'aoi_list_countries', 'aoi_list_country_areas']

// The LLM-facing schema hides these; the workflow supplies them per-attempt
// via canonicalizeCall before the runtime logs/guards the tool call. The
// prompt asset's call shape must agree with the visible schema — drift
// between the two confuses the model and got us once on update.
const WORKFLOW_BOUND_FIELDS = ['recipeType', 'projectId', 'name', 'writableHandles']

function createCreateRecipeSpecialist({llm, bus, innerTools}) {
    const scope = scopeInnerTools({innerTools, allowed: ALLOWED_INNER_TOOLS, label: 'create_recipe'})
    const schemas = hideToolFields(scope.allowedSchemas, {
        tool: 'create_recipe_values', fields: WORKFLOW_BOUND_FIELDS
    })

    const runtime = createSpecialistRuntime({
        llm, bus,
        name: 'recipe.create',
        systemPrompt: specialistPrompt('createRecipeHandles'),
        tools: {
            schemas,
            invoke$: scope.invokeTool$,
            canonicalizeCall: injectWorkflowBoundFields
        },
        finishOnEmpty: anyCreateApplied,
        usageRole: 'create.updater'
    })

    return {consult$}

    function consult$({recipeType, projectId, name, instruction, packet, context}) {
        return runtime.consult$({
            userText: buildCreateUserText({recipeType, projectId, name, instruction, packet}),
            context: {...context, createPacket: packet, createParams: {recipeType, projectId, name}}
        })
    }
}

function injectWorkflowBoundFields(toolCall, context) {
    if (toolCall.name !== 'create_recipe_values') return toolCall
    const packet = context?.createPacket
    const params = context?.createParams
    if (!packet || !params) return toolCall
    return {
        ...toolCall,
        input: {
            ...toolCall.input,
            recipeType: params.recipeType,
            ...(params.projectId !== undefined ? {projectId: params.projectId} : {}),
            ...(params.name !== undefined ? {name: params.name} : {}),
            writableHandles: packet.writableHandles
        }
    }
}

function anyCreateApplied(toolHistory) {
    return toolHistory.some(entry => entry.name === 'create_recipe_values' && entry.ok)
}

function buildCreateUserText({recipeType, projectId, name, instruction, packet}) {
    const lines = [`recipeType: ${recipeType}`]
    if (name) lines.push(`name: ${name}`)
    if (projectId) lines.push(`projectId: ${projectId}`)
    lines.push(`instruction: ${instruction}`)
    lines.push('')
    lines.push('Prepared packet:')
    lines.push(JSON.stringify(packet))
    return lines.join('\n')
}

function hideToolFields(schemas, {tool, fields}) {
    const hidden = new Set(fields)
    return schemas.map(schema => schema.name === tool ? narrowSchema(schema, hidden) : schema)
}

function narrowSchema(schema, hidden) {
    const properties = Object.fromEntries(
        Object.entries(schema.parameters?.properties || {}).filter(([key]) => !hidden.has(key))
    )
    const required = (schema.parameters?.required || []).filter(key => !hidden.has(key))
    return {...schema, parameters: {...schema.parameters, properties, required}}
}

module.exports = {createCreateRecipeSpecialist}
