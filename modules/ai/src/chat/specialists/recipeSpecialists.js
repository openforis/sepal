// Recipe-operation tools backed by a specialist runtime. Today:
// describe_recipe (read-only) and update_recipe (read + patch).

const {catchError, map, mergeMap, of, reduce} = require('rxjs')
const {getRecipeSpec} = require('#recipes')
const {specialistPrompt, updateSummarySystemPrompt} = require('../llmText/prompts')
const {runSpecialist$, SPECIALIST_CAP_ANSWER} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')
const {assembleSpecialistPrompt} = require('./assembleSpecialistPrompt')
const {publishUpdateRecipeOutcome} = require('./specialistEvents')
const {parseValueLabels, enrichOperations} = require('./appliedChanges')
const {retryHintsFromError} = require('./retryHints')
const {valueLabelsFromSchema} = require('./valueLabelsFromSchema')
const {lookupRecipeMetadata$} = require('../tools/recipeMetadata')
const {isChannelEmission} = require('../channelEvents')

const DESCRIBE_RECIPE_ALLOWED = ['recipe_load']
const UPDATE_RECIPE_ALLOWED = ['prepare_update', 'recipe_patch']

// One-time corrective nudge: the specialist prepared an edit but answered with
// prose instead of patching. Mirrors the empty-response stall nudge — give the
// model one structured chance to patch (or ask one concise question) before the
// outer tool returns UPDATE_NOT_ATTEMPTED.
const UPDATE_NO_PATCH_NUDGE = 'You called prepare_update but did not call recipe_patch. If the request is actionable, call recipe_patch now using the prepared baseModelHash and writablePaths. If it is truly ambiguous, ask exactly one concise clarification question.'

function updateNoPatchNudge(toolHistory) {
    const preparedOk = toolHistory.some(entry => entry.name === 'prepare_update' && entry.ok)
    const patchAttempted = toolHistory.some(entry => entry.name === 'recipe_patch')
    return preparedOk && !patchAttempted ? UPDATE_NO_PATCH_NUDGE : null
}

// Tool names whose recipeId arg must equal the recipeId the outer dispatcher
// was asked about. The orchestrator has already chosen the recipe; binding
// at the tool-call boundary makes the scope deterministic rather than prompt-only.
const RECIPE_BOUND_TOOLS = new Set(['recipe_load', 'prepare_update', 'recipe_patch'])

function describeRecipeTool({llm, bus, innerTools, guiRequests}) {
    const basePrompt = specialistPrompt('recipe')
    const {allowedSchemas, invokeTool$: scopedInvokeTool$} = scopeInnerTools({
        innerTools,
        allowed: DESCRIBE_RECIPE_ALLOWED,
        label: 'describe_recipe'
    })

    return {
        name: 'describe_recipe',
        description: 'Describe ONE recipe -> concise prose, not raw model. Optional question narrows. Stateless; call again for follow-ups with the new question plus relevant prior context. Read-only: for edits call update_recipe directly, don\'t chain describe_recipe -> update_recipe.',
        directAnswer: true,
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
        description: 'Update ONE current recipe from natural language. Specialist loads current state, plans, and applies atomic JSON Patch. Use for change/edit/modify/fix, including problem + action ("still clouds, remove them"). Do not call describe_recipe first.',
        directAnswer: true,
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
                    if (envelope.ok === false) {
                        // Preflight failure path: leave the same diagnostic signal
                        // the specialist path emits at envelope-build time, so
                        // "presence of update_recipe.outcome" reliably proves
                        // the orchestrator called update_recipe regardless of
                        // where it failed.
                        publishUpdateRecipeOutcome({
                            bus, conversationId: context?.conversationId, recipeId,
                            attempted: false, succeeded: false,
                            code: envelope.error.code,
                            lastPatchErrorCode: null,
                            answerChars: 0
                        })
                        return of(envelope)
                    }
                    const spec = getRecipeSpec(envelope.data?.type)
                    const valueLabelsText = valueLabelsFromSchema(spec?.schema)
                    const valueLabelsByPath = parseValueLabels(valueLabelsText)
                    const tracker = createPatchOutcomeTracker({bus, conversationId: context?.conversationId, recipeId, valueLabelsByPath})
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.update',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'update'}),
                        userText: buildUpdateUserText({recipeId, instruction}),
                        allowedSchemas,
                        invokeTool$: tracker.wrap(restrictToRecipe(scopedInvokeTool$, recipeId)),
                        noProgressNudge: updateNoPatchNudge,
                        finishOnEmpty: patchAlreadySucceeded,
                        context
                    }).pipe(
                        mergeMap(value => isChannelEmission(value)
                            ? of(value)
                            : finalizeUpdate$({
                                value, tracker, llm,
                                conversationId: context?.conversationId, recipeId, instruction,
                                recipeType: spec?.name || envelope.data?.type,
                                recipeName: envelope.data?.name,
                                valueLabels: valueLabelsText
                            }))
                    )
                })
            )
    }
}

// Tracks recipe_patch outcomes across the specialist's inner loop so the
// outer update_recipe envelope reflects what actually persisted — rather than
// "specialist exited cleanly" being conflated with "user's update applied."
// Also publishes a single update_recipe.outcome bus event when the envelope
// is built so live conversations leave a load-bearing diagnostic signal.
function createPatchOutcomeTracker({bus, conversationId, recipeId, valueLabelsByPath}) {
    let attempted = false
    let succeeded = false
    let lastError = null
    let successSummary = ''
    let operations = []
    let appliedChanges = []
    let invalidatedPaths = []
    let preparedPacket = null
    return {
        // Transforms recipe_patch results before the specialist reads them:
        // success gains label- and context-enriched appliedChanges, failure
        // gains structured retryHints. The latest prepare_update packet is
        // remembered so applied changes can carry previous values and field
        // hints. Raw operations and raw error fields stay untouched.
        wrap: invokeTool$ => (toolCall, context) =>
            invokeTool$(toolCall, context).pipe(
                map(value => annotate(toolCall, value))
            ),
        state: () => ({attempted, succeeded, lastError, successSummary, operations, appliedChanges, invalidatedPaths, preparedPacket}),
        // Synchronous envelope creation from the chosen answer. The answer is
        // decided upstream (raw specialist text, summarizer prose, or the generic
        // fallback) so this layer stays I/O-free; it only shapes + publishes.
        finalize: answer => {
            const envelope = buildEnvelope(answer)
            publishUpdateRecipeOutcome({
                bus,
                conversationId,
                recipeId,
                attempted,
                succeeded,
                code: succeeded ? 'ok' : envelope.error.code,
                lastPatchErrorCode: lastError?.code || null,
                answerChars: answer.length
            })
            return envelope
        }
    }

    function annotate(toolCall, value) {
        if (isChannelEmission(value)) return value
        if (toolCall.name === 'prepare_update' && value?.ok === true) {
            preparedPacket = value.data
            return value
        }
        if (toolCall.name !== 'recipe_patch') return value
        attempted = true
        if (value?.ok === true) {
            succeeded = true
            lastError = null
            successSummary = value.data?.summary || ''
            const changes = enrichOperations(toolCall.input?.operations, valueLabelsByPath, preparedPacket)
            operations = [...operations, ...(toolCall.input?.operations || [])]
            appliedChanges = [...appliedChanges, ...changes]
            invalidatedPaths = value.data?.invalidatedPaths || invalidatedPaths
            return {...value, data: {...value.data, appliedChanges: changes}}
        }
        lastError = value.error
        return {...value, error: {...value.error, retryHints: retryHintsFromError(value.error, toolCall.input?.operations)}}
    }

    function buildEnvelope(answer) {
        if (succeeded) return {ok: true, data: {answer}}
        if (attempted) return {
            ok: false,
            error: {
                code: 'UPDATE_FAILED',
                message: lastError?.message || 'Recipe patch did not succeed.',
                patchError: lastError,
                specialistAnswer: answer,
                answer: failureAnswer(lastError)
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

// Chooses the update_recipe answer and builds the final envelope. The async
// step lives here (not in the synchronous tracker): when the patch applied but
// the specialist ended with no usable text — common for local thinking models
// that reason then emit nothing — one response-only summarizer pass turns the
// applied patch into user-facing prose. An empty/failed summary leaves the
// deterministic generic answer (the patch tool's own summary) in place.
function finalizeUpdate$({value, tracker, llm, conversationId, recipeId, instruction, recipeType, recipeName, valueLabels}) {
    const rawAnswer = value?.answer || ''
    const {succeeded, successSummary, operations, appliedChanges, invalidatedPaths, preparedPacket} = tracker.state()
    if (succeeded && isEmptyFinal(rawAnswer)) {
        return summarizeUpdate$({
            llm, conversationId, recipeId, instruction, recipeType, recipeName, valueLabels,
            operations, appliedChanges, invalidatedPaths,
            dependencyFacts: preparedPacket?.dependencyFacts,
            validationRules: preparedPacket?.validationRules
        }).pipe(
            map(summary => tracker.finalize(summary.trim() || successSummary))
        )
    }
    return of(tracker.finalize(rawAnswer))
}

// Once a recipe_patch has applied, an empty specialist response means the work
// is done and the model just narrated nothing — finish the loop and let the
// narrower summarizer own the final answer, rather than spending a stall round
// that re-reasons over the whole recipe.
function patchAlreadySucceeded(toolHistory) {
    return toolHistory.some(entry => entry.name === 'recipe_patch' && entry.ok)
}

function isEmptyFinal(answer) {
    return !answer.trim() || answer === SPECIALIST_CAP_ANSWER
}

// One tool-free, reasoning-disabled call that narrates the applied patch in
// user-facing terms. Fed only patch-outcome data (no full model, no reasoning):
// applied changes (with previous values + labels), raw operations, invalidated
// paths, the coupling facts/rules from prepare_update, and the user's request.
function summarizeUpdate$({llm, conversationId, recipeId, instruction, recipeType, recipeName, valueLabels, operations, appliedChanges, invalidatedPaths, dependencyFacts, validationRules}) {
    return llm.respondTo$({
        messages: buildSummaryMessages({instruction, recipeType, recipeName, valueLabels, operations, appliedChanges, invalidatedPaths, dependencyFacts, validationRules}),
        tools: [],
        disableReasoning: true,
        debugLabel: `update.summary ${recipeId}`,
        usageContext: {role: 'update.summary', conversationId, recipeId}
    }).pipe(
        reduce((text, event) => text + (event.textDelta || ''), ''),
        catchError(() => of(''))
    )
}

function buildSummaryMessages({instruction, recipeType, recipeName, valueLabels, operations, appliedChanges, invalidatedPaths, dependencyFacts, validationRules}) {
    return [
        {role: 'system', content: updateSummarySystemPrompt()},
        {role: 'user', content: buildSummaryUserText({instruction, recipeType, recipeName, valueLabels, operations, appliedChanges, invalidatedPaths, dependencyFacts, validationRules})}
    ]
}

function buildSummaryUserText({instruction, recipeType, recipeName, valueLabels, operations, appliedChanges, invalidatedPaths, dependencyFacts, validationRules}) {
    const lines = []
    if (instruction) lines.push(`userRequest: ${instruction}`)
    if (recipeType) lines.push(`recipeType: ${recipeType}`)
    if (recipeName) lines.push(`recipeName: ${recipeName}`)
    if (valueLabels) lines.push(`valueLabels:\n${valueLabels}`)
    if (appliedChanges?.length) lines.push(`appliedChanges: ${JSON.stringify(appliedChanges)}`)
    lines.push(`appliedOperations: ${JSON.stringify(operations || [])}`)
    if (invalidatedPaths?.length) lines.push(`invalidatedPaths: ${JSON.stringify(invalidatedPaths)}`)
    if (dependencyFacts?.length) lines.push(`dependencyFacts: ${JSON.stringify(dependencyFacts)}`)
    if (validationRules?.length) lines.push(`validationRules: ${JSON.stringify(validationRules)}`)
    return lines.join('\n')
}

// User-facing explanation of why the update was rejected, built from the human
// validation messages the patch tool surfaced. The specialist's own prose on a
// failed run is often the generic step-cap string, so the actionable reason has
// to come from the validation details. Rule names and JSON pointers stay in the
// structured envelope (patchError.details) and logs — internal identifiers, not
// chat copy.
function failureAnswer(patchError) {
    const reasons = (patchError?.details || []).map(detail => detail.message)
    const detail = reasons.length ? reasons.join('; ') : (patchError?.message || 'the change could not be applied')
    return `I couldn't apply that update: ${detail}.`
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
