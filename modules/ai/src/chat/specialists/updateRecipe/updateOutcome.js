// Projects an update specialist's run timeline into the user-facing envelope
// and publishes the load-bearing update_recipe.outcome diagnostic. A later
// successful update_recipe_values call overrides an earlier failure; the
// latest successful call owns invalidatedHandles (it describes the final
// model state). The reduce-shaped projection keeps the order semantics
// explicit and stops `collectAppliedValues` from being the only nested loop
// in the touched path.

const {publishUpdateRecipeOutcome} = require('../specialistEvents')

const UPDATE_TOOL = 'update_recipe_values'

function projectUpdateOutcome(timeline) {
    const tools = timeline.filter(entry => entry.kind === 'tool' && entry.name === UPDATE_TOOL)
    const succeeded = tools.filter(entry => entry.ok)
    return {
        attempted: tools.length > 0,
        succeeded: succeeded.length > 0,
        lastError: tools.reduce((error, entry) => entry.ok ? null : entry.result?.error, null),
        successSummary: lastOf(succeeded)?.result?.data?.summary || '',
        appliedHandles: distinct(succeeded.flatMap(entry => appliedHandlesOf(entry))),
        appliedValues: collectAppliedValues(succeeded),
        invalidatedHandles: succeeded.reduce((handles, entry) => entry.result?.data?.invalidatedHandles || handles, [])
    }
}

function publishOutcomeAndShape({outcome, answer, capped = false, bus, conversationId, recipeId}) {
    const envelope = buildEnvelope(outcome, answer, {capped})
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

// Three not-succeeded branches, in order:
//   UPDATE_FAILED         — update_recipe_values ran and the last call failed.
//   CLARIFICATION_NEEDED  — the updater chose to ask / explain instead of
//                           calling the tool, and its text is meant for the
//                           user (`error.answer` streams straight through).
//   UPDATE_NOT_ATTEMPTED  — residual: no call, no usable text. Capped runs
//                           land here too: the cap text is a runtime sentinel,
//                           not deliberate communication.
function buildEnvelope(outcome, answer, {capped = false} = {}) {
    if (outcome.succeeded) return {ok: true, data: {answer}}
    if (outcome.attempted) return {
        ok: false,
        error: {
            code: 'UPDATE_FAILED',
            message: outcome.lastError?.message || 'Recipe update did not succeed.',
            patchError: outcome.lastError,
            specialistAnswer: answer,
            answer: failureAnswer(outcome.lastError)
        }
    }
    if (answer.trim() && !capped) return {
        ok: false,
        error: {
            code: 'CLARIFICATION_NEEDED',
            message: 'The update specialist asked for more information before proceeding.',
            answer
        }
    }
    return {
        ok: false,
        error: {
            code: 'UPDATE_NOT_ATTEMPTED',
            message: 'The update specialist did not call update_recipe_values.',
            specialistAnswer: answer,
            answer: answer || "I couldn't apply that update."
        }
    }
}

function failureAnswer(patchError) {
    if (Array.isArray(patchError?.handleErrors) && patchError.handleErrors.length) {
        const reasons = patchError.handleErrors.map(formatHandleError)
        return `I couldn't apply that update: ${reasons.join('; ')}.`
    }
    return `I couldn't apply that update: ${patchError?.message || 'the change could not be applied'}.`
}

function formatHandleError({handle, message}) {
    return handle ? `${handle}: ${message}` : message
}

// Builds the {handle: value} map of values that survived to the final model:
// the input values of each successful call, filtered to handles the tool
// confirmed it applied. A later call's value for the same handle overwrites
// earlier ones — successful retries are the canonical case for this overwrite.
function collectAppliedValues(succeeded) {
    return succeeded.reduce(
        (values, entry) => ({...values, ...appliedSubset(entry.input?.values || {}, appliedHandlesOf(entry))}),
        {}
    )
}

function appliedSubset(values, appliedHandles) {
    const applied = new Set(appliedHandles)
    return Object.fromEntries(Object.entries(values).filter(([handle]) => applied.has(handle)))
}

function appliedHandlesOf(entry) {
    return entry.result?.data?.appliedHandles || []
}

function lastOf(list) {
    return list.length ? list[list.length - 1] : null
}

function distinct(list) {
    return [...new Set(list)]
}

module.exports = {projectUpdateOutcome, publishOutcomeAndShape, buildEnvelope, failureAnswer}
