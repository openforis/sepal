// Recipe-operation tools backed by a specialist runtime. Today:
// describe_recipe (read-only) and update_recipe (read + patch).

const {map, mergeMap, of, tap} = require('rxjs')
const {getRecipeSpec} = require('#recipes')
const {specialistPrompt} = require('../llmText/prompts')
const {runSpecialist$} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')
const {assembleSpecialistPrompt} = require('./assembleSpecialistPrompt')
const {lookupRecipeMetadata$} = require('../tools/recipeMetadata')
const {isChannelEmission} = require('../channelEvents')

const DESCRIBE_RECIPE_ALLOWED = ['recipe_load']
const UPDATE_RECIPE_ALLOWED = ['load_for_update', 'recipe_patch']

// Tool names whose recipeId arg must equal the recipeId the outer dispatcher
// was asked about. The orchestrator has already chosen the recipe; binding
// at the tool-call boundary makes the scope deterministic rather than prompt-only.
const RECIPE_BOUND_TOOLS = new Set(['recipe_load', 'load_for_update', 'recipe_patch'])

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
                    if (isChannelEmission(envelope)) return of(envelope)
                    if (envelope.ok === false) return of(envelope)
                    const spec = getRecipeSpec(envelope.data?.type)
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.describe',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'describe'}),
                        userText: buildDescribeUserText({recipeId, question}),
                        allowedSchemas,
                        invokeTool$: restrictToRecipe(scopedInvokeTool$, recipeId),
                        context
                    })
                })
            )
    }
}

function updateRecipeTool({llm, bus, innerTools, guiRequests}) {
    const basePrompt = specialistPrompt('update')
    const {allowedSchemas, invokeTool$: scopedInvokeTool$} = scopeInnerTools({
        innerTools,
        allowed: UPDATE_RECIPE_ALLOWED,
        label: 'update_recipe'
    })

    return {
        name: 'update_recipe',
        description: 'Update ONE recipe by natural-language instruction -> specialist plans + applies JSON Patch atomically against effective model. Stateless. Use for change/edit/modify requests on a saved recipe.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                instruction: {type: 'string'}
            },
            required: ['recipeId', 'instruction'],
            additionalProperties: false
        },
        invoke$: ({recipeId, instruction}, context) =>
            lookupRecipeMetadata$(guiRequests, context, recipeId).pipe(
                mergeMap(envelope => {
                    if (isChannelEmission(envelope)) return of(envelope)
                    if (envelope.ok === false) return of(envelope)
                    const spec = getRecipeSpec(envelope.data?.type)
                    const tracker = createPatchOutcomeTracker()
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.update',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'update', includeSchema: true}),
                        userText: buildUpdateUserText({recipeId, instruction}),
                        allowedSchemas,
                        invokeTool$: tracker.wrap(restrictToRecipe(scopedInvokeTool$, recipeId)),
                        context
                    }).pipe(
                        map(value => isChannelEmission(value) ? value : tracker.envelopeFor(value))
                    )
                })
            )
    }
}

// Tracks recipe_patch outcomes across the specialist's inner loop so the
// outer update_recipe envelope reflects what actually persisted — rather than
// "specialist exited cleanly" being conflated with "user's update applied."
function createPatchOutcomeTracker() {
    let attempted = false
    let succeeded = false
    let lastError = null
    return {
        wrap: invokeTool$ => (toolCall, context) =>
            invokeTool$(toolCall, context).pipe(
                tap(value => {
                    if (isChannelEmission(value)) return
                    if (toolCall.name !== 'recipe_patch') return
                    attempted = true
                    if (value?.ok === true) {
                        succeeded = true
                        lastError = null
                    } else if (value?.ok === false) {
                        lastError = value.error
                    }
                })
            ),
        envelopeFor: specialistResult => {
            const answer = specialistResult?.answer || ''
            if (succeeded) return {ok: true, data: {answer}}
            if (attempted) return {
                ok: false,
                error: {
                    code: 'UPDATE_FAILED',
                    message: lastError?.message || 'Recipe patch did not succeed.',
                    patchError: lastError,
                    specialistAnswer: answer
                }
            }
            return {
                ok: false,
                error: {
                    code: 'UPDATE_NOT_ATTEMPTED',
                    message: 'The update specialist did not call recipe_patch.',
                    specialistAnswer: answer
                }
            }
        }
    }
}

function restrictToRecipe(invokeTool$, recipeId) {
    return (toolCall, context) => {
        if (RECIPE_BOUND_TOOLS.has(toolCall.name) && toolCall.input?.recipeId !== recipeId) {
            return of({
                ok: false,
                error: {
                    code: 'RECIPE_SCOPE_VIOLATION',
                    message: `${toolCall.name} restricted to recipeId=${recipeId}; got ${toolCall.input?.recipeId}`
                }
            })
        }
        return invokeTool$(toolCall, context)
    }
}

function buildDescribeUserText({recipeId, question}) {
    const head = `recipeId: ${recipeId}`
    if (!question) return head
    return `${head}\nquestion: ${question}`
}

function buildUpdateUserText({recipeId, instruction}) {
    return `recipeId: ${recipeId}\ninstruction: ${instruction}`
}

module.exports = {describeRecipeTool, updateRecipeTool}
