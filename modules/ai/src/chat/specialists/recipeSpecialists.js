// Recipe-operation tools backed by a specialist runtime. Today:
// describe_recipe.

const {mergeMap, of} = require('rxjs')
const {getRecipeSpec} = require('#sepal/recipe')
const {specialistPrompt} = require('../llmText/prompts')
const {runSpecialist$} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')
const {assembleSpecialistPrompt} = require('./assembleSpecialistPrompt')
const {lookupRecipeMetadata$} = require('../tools/recipeMetadata')

const DESCRIBE_RECIPE_ALLOWED = ['recipe_load']

function describeRecipeTool({llm, bus, innerTools, guiRequests}) {
    const basePrompt = specialistPrompt('recipe')
    const {allowedSchemas, invokeTool$: scopedInvokeTool$} = scopeInnerTools({
        innerTools,
        allowed: DESCRIBE_RECIPE_ALLOWED,
        label: 'describe_recipe'
    })

    return {
        name: 'describe_recipe',
        description: 'Describe ONE recipe -> concise prose, not raw model. Optional question narrows. Stateless; call again for follow-ups with the new question plus relevant prior context.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                question: {type: 'string'}
            },
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: ({recipeId, question}, context) =>
            lookupRecipeMetadata$(guiRequests, context, recipeId).pipe(
                mergeMap(envelope => {
                    if (envelope.ok === false) return of(envelope)
                    const spec = getRecipeSpec(envelope.data?.type)
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.describe',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec),
                        userText: buildUserText({recipeId, question}),
                        allowedSchemas,
                        invokeTool$: restrictToRecipe(scopedInvokeTool$, recipeId),
                        context
                    })
                })
            )
    }
}

// recipe_load can in principle accept any recipeId. The orchestrator has
// already chosen the recipe; binding the specialist to that recipeId at the
// tool-call boundary makes the scope deterministic rather than prompt-only.
function restrictToRecipe(invokeTool$, recipeId) {
    return (toolCall, context) => {
        if (toolCall.name === 'recipe_load' && toolCall.input?.recipeId !== recipeId) {
            return of({
                ok: false,
                error: {
                    code: 'RECIPE_SCOPE_VIOLATION',
                    message: `recipe_load restricted to recipeId=${recipeId}; got ${toolCall.input?.recipeId}`
                }
            })
        }
        return invokeTool$(toolCall, context)
    }
}

function buildUserText({recipeId, question}) {
    const head = `recipeId: ${recipeId}`
    if (!question) return head
    return `${head}\nquestion: ${question}`
}

module.exports = {describeRecipeTool}
