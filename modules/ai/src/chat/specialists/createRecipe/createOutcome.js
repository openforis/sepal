// Projects a create specialist's run timeline into the user-facing envelope
// and publishes the create_recipe.outcome diagnostic. Mirrors updateOutcome's
// shape — three not-succeeded branches (CREATE_FAILED, CLARIFICATION_NEEDED,
// CREATE_NOT_ATTEMPTED) with the same cap-vs-clarification distinction —
// but tracks createdRecipeId rather than appliedHandles, since create's
// success surface is identity, not a diff.

const {publishCreateRecipeOutcome} = require('../specialistEvents')

const CREATE_TOOL = 'create_recipe_values'

function projectCreateOutcome(timeline) {
    const tools = timeline.filter(entry => entry.kind === 'tool' && entry.name === CREATE_TOOL)
    const succeeded = tools.filter(entry => entry.ok)
    return {
        attempted: tools.length > 0,
        succeeded: succeeded.length > 0,
        lastError: tools.reduce((error, entry) => entry.ok ? null : entry.result?.error, null),
        createdRecipeId: lastOf(succeeded)?.result?.data?.recipeId || null,
        successSummary: lastOf(succeeded)?.result?.data?.summary || ''
    }
}

function publishOutcomeAndShape({outcome, answer, capped = false, bus, conversationId, recipeType}) {
    const envelope = buildEnvelope(outcome, answer, {capped})
    publishCreateRecipeOutcome({
        bus, conversationId, recipeType,
        recipeId: outcome.createdRecipeId,
        attempted: outcome.attempted,
        succeeded: outcome.succeeded,
        code: outcome.succeeded ? 'ok' : envelope.error.code,
        lastToolErrorCode: outcome.lastError?.code || null,
        answerChars: answer.length
    })
    return envelope
}

// Three not-succeeded branches, in order:
//   CREATE_FAILED         — create_recipe_values ran and the last call failed.
//   CLARIFICATION_NEEDED  — the specialist chose to ask / explain instead of
//                           calling the tool, and its text is meant for the
//                           user (`error.answer` streams straight through).
//   CREATE_NOT_ATTEMPTED  — residual: no call, no usable text. Capped runs
//                           land here too: the cap text is a runtime sentinel,
//                           not deliberate communication.
function buildEnvelope(outcome, answer, {capped = false} = {}) {
    if (outcome.succeeded) return {ok: true, data: {answer}}
    if (outcome.attempted) return {
        ok: false,
        error: {
            code: 'CREATE_FAILED',
            message: outcome.lastError?.message || 'Recipe create did not succeed.',
            toolError: outcome.lastError,
            specialistAnswer: answer,
            answer: failureAnswer(outcome.lastError)
        }
    }
    if (answer.trim() && !capped) return {
        ok: false,
        error: {
            code: 'CLARIFICATION_NEEDED',
            message: 'The create specialist asked for more information before proceeding.',
            answer
        }
    }
    return {
        ok: false,
        error: {
            code: 'CREATE_NOT_ATTEMPTED',
            message: 'The create specialist did not call create_recipe_values.',
            specialistAnswer: answer,
            answer: answer || "I couldn't create that recipe."
        }
    }
}

function failureAnswer(toolError) {
    if (Array.isArray(toolError?.handleErrors) && toolError.handleErrors.length) {
        const reasons = toolError.handleErrors.map(formatHandleError)
        return `I couldn't create that recipe: ${reasons.join('; ')}.`
    }
    return `I couldn't create that recipe: ${toolError?.message || 'the recipe could not be created'}.`
}

function formatHandleError({handle, message}) {
    return handle ? `${handle}: ${message}` : message
}

function lastOf(list) {
    return list.length ? list[list.length - 1] : null
}

module.exports = {projectCreateOutcome, publishOutcomeAndShape, buildEnvelope, failureAnswer}
