// Recipe-operation tools whose implementation is a specialist runtime.
// Today: describe_recipe. The orchestrator sees describe_recipe; the
// recipe specialist's inner LLM gets recipe_load plus the projected
// recipe.

const {of} = require('rxjs')
const {specialistPrompt} = require('../llmText/prompts')
const {runSpecialist$} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')

const DESCRIBE_RECIPE_ALLOWED = ['recipe_load']

function describeRecipeTool({llm, tracer, innerTools}) {
    const systemPrompt = specialistPrompt('recipe')
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
        invoke$: ({recipeId, question}, context) => runSpecialist$({
            llm, tracer,
            name: 'recipe.describe',
            systemPrompt,
            userText: buildUserText({recipeId, question}),
            allowedSchemas,
            invokeTool$: restrictToRecipe(scopedInvokeTool$, recipeId),
            context
        })
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
