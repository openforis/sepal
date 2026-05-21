// Recipe-operation tools backed by a specialist runtime. Today:
// describe_recipe (read-only) and update_recipe (read + patch).

const {catchError, map, mergeMap, of, reduce} = require('rxjs')
const {getRecipeSpec} = require('#recipes')
const {specialistPrompt, updateSummarySystemPrompt} = require('../llmText/prompts')
const {runSpecialist$, answerOnly, SPECIALIST_CAP_ANSWER} = require('./runSpecialist')
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

// directAnswer tools must carry user-facing prose even when preflight fails, so
// the orchestrator streams it straight to the user rather than attempting a
// restate round over an answer-less failure envelope. Only RECIPE_NOT_FOUND
// means the recipe is gone; other codes (TOOL_FAILED, timeout, bridge down) are
// transient, so they get a try-again answer rather than claiming non-existence.
const UPDATE_NOT_FOUND_ANSWER = "I couldn't find the recipe to update. It may have been closed, deleted, or not loaded in this session."
const DESCRIBE_NOT_FOUND_ANSWER = "I couldn't find that recipe. It may have been closed, deleted, or not loaded in this session."
const UPDATE_LOOKUP_FAILED_ANSWER = "I couldn't look up the recipe to update right now. Please try again."
const DESCRIBE_LOOKUP_FAILED_ANSWER = "I couldn't look up that recipe right now. Please try again."

function withPreflightAnswer(envelope, {notFound, fallback}) {
    const answer = envelope.error?.code === 'RECIPE_NOT_FOUND' ? notFound : fallback
    return {...envelope, error: {...envelope.error, answer}}
}

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
                    if (envelope.ok === false) return of(withPreflightAnswer(envelope, {notFound: DESCRIBE_NOT_FOUND_ANSWER, fallback: DESCRIBE_LOOKUP_FAILED_ANSWER}))
                    const spec = getRecipeSpec(envelope.data?.type)
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.describe',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'describe'}),
                        userText: buildDescribeUserText({recipeId, question}),
                        allowedSchemas,
                        invokeTool$: restrictToRecipe(scopedInvokeTool$, recipeId),
                        context
                    }).pipe(answerOnly())
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
                        // where it failed. Build the user-facing answer first so
                        // answerChars reflects what actually reaches the user.
                        const failure = withPreflightAnswer(envelope, {notFound: UPDATE_NOT_FOUND_ANSWER, fallback: UPDATE_LOOKUP_FAILED_ANSWER})
                        publishUpdateRecipeOutcome({
                            bus, conversationId: context?.conversationId, recipeId,
                            attempted: false, succeeded: false,
                            code: envelope.error.code,
                            lastPatchErrorCode: null,
                            answerChars: failure.error.answer.length
                        })
                        return of(failure)
                    }
                    const spec = getRecipeSpec(envelope.data?.type)
                    const valueLabelsText = valueLabelsFromSchema(spec?.schema)
                    const valueLabelsByPath = parseValueLabels(valueLabelsText)
                    const enricher = createPatchEnricher({valueLabelsByPath})
                    return runSpecialist$({
                        llm, bus,
                        name: 'recipe.update',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'update'}),
                        userText: buildUpdateUserText({recipeId, instruction}),
                        allowedSchemas,
                        invokeTool$: enricher.wrap(restrictToRecipe(scopedInvokeTool$, recipeId)),
                        noProgressNudge: updateNoPatchNudge,
                        finishOnEmpty: patchAlreadySucceeded,
                        context
                    }).pipe(
                        mergeMap(value => isChannelEmission(value)
                            ? of(value)
                            : finalizeUpdate$({
                                result: value, llm, bus,
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

// Tool-result middleware for the update specialist: a successful recipe_patch
// gains label- and context-enriched appliedChanges, a failed one gains
// structured retryHints, before the specialist reads the result. Raw operations
// and raw error fields stay untouched. The latest prepare_update packet is the
// only state it carries — enrichment context (previous values + field hints)
// for the next patch. What actually persisted is projected from the loop
// timeline afterward (projectUpdateOutcome), not shadow-tracked here.
function createPatchEnricher({valueLabelsByPath}) {
    let preparedPacket = null
    return {
        wrap: invokeTool$ => (toolCall, context) =>
            invokeTool$(toolCall, context).pipe(
                map(value => annotate(toolCall, value))
            )
    }

    function annotate(toolCall, value) {
        if (isChannelEmission(value)) return value
        if (toolCall.name === 'prepare_update' && value?.ok === true) {
            preparedPacket = value.data
            return value
        }
        if (toolCall.name !== 'recipe_patch') return value
        if (value?.ok === true) {
            const changes = enrichOperations(toolCall.input?.operations, valueLabelsByPath, preparedPacket)
            return {...value, data: {...value.data, appliedChanges: changes}}
        }
        return {...value, error: {...value.error, retryHints: retryHintsFromError(value.error, toolCall.input?.operations)}}
    }
}

// Projects what the recipe_patch calls actually did from the specialist loop
// timeline, so "specialist exited cleanly" is never conflated with "user's
// update applied." A later success overrides an earlier failure; the applied
// changes (already label-enriched by the patch middleware) and raw operations
// accumulate across successful patches, while invalidatedPaths is the latest
// successful patch's set — it describes the final model state, not a union of
// intermediate ones. lastError is the last patch error still standing;
// preparedPacket is the latest prepare_update for narration context.
function projectUpdateOutcome(timeline) {
    const tools = timeline.filter(entry => entry.kind === 'tool')
    const patches = tools.filter(entry => entry.name === 'recipe_patch')
    const succeededPatches = patches.filter(entry => entry.ok)
    return {
        attempted: patches.length > 0,
        succeeded: succeededPatches.length > 0,
        lastError: patches.reduce((error, entry) => entry.ok ? null : entry.result?.error, null),
        successSummary: lastOf(succeededPatches)?.result?.data?.summary || '',
        operations: succeededPatches.flatMap(entry => entry.input?.operations || []),
        appliedChanges: succeededPatches.flatMap(entry => entry.result?.data?.appliedChanges || []),
        invalidatedPaths: succeededPatches.reduce((paths, entry) => entry.result?.data?.invalidatedPaths || paths, []),
        preparedPacket: lastOf(tools.filter(entry => entry.name === 'prepare_update' && entry.ok))?.result?.data || null
    }
}

function lastOf(list) {
    return list.length ? list[list.length - 1] : null
}

// Chooses the update_recipe answer and builds the final envelope. The async
// step lives here (not in the synchronous projection): when the patch applied
// but the specialist ended with no usable text — common for local thinking
// models that reason then emit nothing — one response-only summarizer pass
// turns the applied patch into user-facing prose. An empty/failed summary
// leaves the deterministic generic answer (the patch tool's own summary) in place.
function finalizeUpdate$({result, llm, bus, conversationId, recipeId, instruction, recipeType, recipeName, valueLabels}) {
    const outcome = projectUpdateOutcome(result.timeline)
    const rawAnswer = result?.answer || ''
    if (outcome.succeeded && isEmptyFinal(rawAnswer)) {
        return summarizeUpdate$({
            llm, conversationId, recipeId, instruction, recipeType, recipeName, valueLabels,
            operations: outcome.operations, appliedChanges: outcome.appliedChanges, invalidatedPaths: outcome.invalidatedPaths,
            dependencyFacts: outcome.preparedPacket?.dependencyFacts,
            validationRules: outcome.preparedPacket?.validationRules
        }).pipe(
            map(summary => finalizeOutcome({outcome, answer: summary.trim() || outcome.successSummary, bus, conversationId, recipeId}))
        )
    }
    return of(finalizeOutcome({outcome, answer: rawAnswer, bus, conversationId, recipeId}))
}

// Shapes the chosen answer into the update_recipe envelope and publishes the
// single load-bearing update_recipe.outcome diagnostic. answerChars reflects
// the answer that actually reaches the user.
function finalizeOutcome({outcome, answer, bus, conversationId, recipeId}) {
    const envelope = buildEnvelope(outcome, answer)
    publishUpdateRecipeOutcome({
        bus, conversationId, recipeId,
        attempted: outcome.attempted,
        succeeded: outcome.succeeded,
        code: outcome.succeeded ? 'ok' : envelope.error.code,
        lastPatchErrorCode: outcome.lastError?.code || null,
        answerChars: answer.length
    })
    return envelope
}

function buildEnvelope(outcome, answer) {
    if (outcome.succeeded) return {ok: true, data: {answer}}
    if (outcome.attempted) return {
        ok: false,
        error: {
            code: 'UPDATE_FAILED',
            message: outcome.lastError?.message || 'Recipe patch did not succeed.',
            patchError: outcome.lastError,
            specialistAnswer: answer,
            answer: failureAnswer(outcome.lastError)
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
