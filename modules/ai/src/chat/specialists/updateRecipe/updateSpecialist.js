const {specialistPrompt} = require('../../llmText/prompts')
const {createSpecialistRuntime} = require('../runSpecialist')
const {scopeInnerTools, bindToolsToRecipe} = require('../specialistScope')

const ALLOWED_INNER_TOOLS = ['update_recipe_values']
const RECIPE_BOUND_TOOLS = new Set(['update_recipe_values'])

// The LLM-facing schema hides these; the workflow supplies them per-attempt
// via canonicalizeCall before the runtime logs/guards the tool call.
const WORKFLOW_BOUND_FIELDS = ['writableHandles', 'baseModelHash']

function createRecipeUpdateSpecialist({llm, bus, innerTools}) {
    const scope = scopeInnerTools({innerTools, allowed: ALLOWED_INNER_TOOLS, label: 'update_recipe'})
    const schemas = hideToolFields(scope.allowedSchemas, {
        tool: 'update_recipe_values', fields: WORKFLOW_BOUND_FIELDS
    })

    const runtime = createSpecialistRuntime({
        llm, bus,
        name: 'recipe.update',
        systemPrompt: specialistPrompt('updateHandles'),
        tools: {
            schemas,
            invoke$: bindToolsToRecipe(scope.invokeTool$, {boundTools: RECIPE_BOUND_TOOLS}),
            canonicalizeCall: injectWorkflowBoundFields
        },
        finishOnEmpty: anyUpdateApplied,
        usageRole: 'update.updater'
    })

    return {consult$}

    function consult$({recipeId, request, contextText, packet, context}) {
        return runtime.consult$({
            userText: buildUpdaterUserText({recipeId, request, contextText, packet}),
            context: {...context, recipeId, updatePacket: packet}
        })
    }
}

function injectWorkflowBoundFields(toolCall, context) {
    if (toolCall.name !== 'update_recipe_values') return toolCall
    const packet = context?.updatePacket
    if (!packet) return toolCall
    return {
        ...toolCall,
        input: {
            ...toolCall.input,
            writableHandles: packet.writableHandles,
            baseModelHash: packet.baseModelHash
        }
    }
}

function anyUpdateApplied(toolHistory) {
    return toolHistory.some(entry => entry.name === 'update_recipe_values' && entry.ok)
}

function buildUpdaterUserText({recipeId, request, contextText, packet}) {
    const lines = [`recipeId: ${recipeId}`, `request: ${request ?? ''}`]
    if (contextText && contextText.trim()) lines.push(`context: ${contextText}`)
    lines.push('', 'Prepared packet:', JSON.stringify(packet))
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

module.exports = {createRecipeUpdateSpecialist}
