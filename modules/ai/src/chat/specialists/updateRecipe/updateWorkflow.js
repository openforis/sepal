// The recipe-update workflow. One call to workflow.run$ → one attempt
// through the stage chain. Stages are pure over state: each takes the
// attempt's accumulating state, returns an Observable whose value is either
//
//   {state: nextState}   advance to the next stage
//   {done: envelope}     short-circuit with the final user-facing envelope
//
// Channel emissions ride through the chain untouched. The runner watches for
// `done` and stops calling later stages; the terminal stage always emits
// `done`.
//
//   identify  recipe metadata + verify the recipe type has a handle catalog
//   intend    picker translates the instruction into recipe handles
//   scope     deterministic prepare expands handle dependencies + current
//             values into a writable, handle-keyed packet
//   apply     update specialist runs the LLM loop on update_recipe_values
//             (owns its prompt, scope, tool wrappers — see updateSpecialist)
//   report    project the timeline into a user-facing envelope and publish
//             the update_recipe.outcome diagnostic; fall back to a summary
//             LLM call when the updater answered empty after a success

const {map, mergeMap, of} = require('rxjs')
const {getRecipeHandles} = require('#recipes')
const {wasCapped} = require('../runSpecialist')
const {publishUpdateRecipeOutcome} = require('../specialistEvents')
const {lookupRecipeMetadata$} = require('../../tools/recipeMetadata')
const {isChannelEmission} = require('../../channelEvents')
const {pickHandles$} = require('./pickHandles')
const {prepareHandlePacket$} = require('./prepareHandlePacket')
const {projectUpdateOutcome, publishOutcomeAndShape} = require('./updateOutcome')
const {summarizeUpdate$} = require('./updateSummary')
const {createRecipeUpdateSpecialist} = require('./updateSpecialist')

// directAnswer tools carry user-facing prose even when the attempt short-
// circuits, so the orchestrator can stream it without an answer-less restate.
const NOT_FOUND_ANSWER = "I couldn't find the recipe to update. It may have been closed, deleted, or not loaded in this session."
const LOOKUP_FAILED_ANSWER = "I couldn't look up the recipe to update right now. Please try again."
const PICKER_FAILED_ANSWER = "I couldn't figure out which recipe fields your request was about. Please try rephrasing."
const UNSUPPORTED_RECIPE_ANSWER = "This recipe type isn't supported by the chat updater yet."
const PREPARE_FAILED_ANSWER = "I couldn't prepare that update right now. Please try again."

function createUpdateWorkflow({llm, bus, guiRequests, innerTools}) {
    const updater = createRecipeUpdateSpecialist({llm, bus, innerTools})

    return {run$}

    function run$({recipeId, instruction, context}) {
        return runStages$({recipeId, instruction, context}, [identify$, intend$, scopeFor$, applyAndReport$])
    }

    // --- identify: who are we editing? -------------------------------------

    function identify$(state) {
        return lookupRecipeMetadata$(guiRequests, state.context, state.recipeId).pipe(
            map(envelope => {
                if (isChannelEmission(envelope)) return envelope
                if (envelope.ok === false) return done(failPreflight(state, envelope))
                const type = envelope.data?.type
                const name = envelope.data?.name
                if (!getRecipeHandles(type)) {
                    return done(fail(state, {
                        code: 'UNSUPPORTED_RECIPE_TYPE',
                        message: `Recipe type ${type} has no handle catalog`,
                        answer: UNSUPPORTED_RECIPE_ANSWER
                    }))
                }
                return advance(state, {recipeType: type, recipeName: name})
            })
        )
    }

    // --- intend: which handles is the user asking about? -------------------

    function intend$(state) {
        return pickHandles$({
            llm,
            recipeType: state.recipeType, recipeName: state.recipeName,
            instruction: state.instruction,
            conversationId: state.context?.conversationId
        }).pipe(
            map(picker => picker.ok === false
                ? done(fail(state, {code: picker.error.code, message: picker.error.message, answer: PICKER_FAILED_ANSWER}))
                : advance(state, {handles: picker.handles})
            )
        )
    }

    // --- scope: bound the write to picked + dependent handles --------------

    function scopeFor$(state) {
        return prepareHandlePacket$({
            guiRequests,
            recipeId: state.recipeId,
            recipeType: state.recipeType,
            pickedHandles: state.handles,
            context: state.context
        }).pipe(
            map(packet => {
                if (isChannelEmission(packet)) return packet
                if (packet.ok === false) {
                    return done(fail(state, {code: packet.error.code, message: packet.error.message, answer: PREPARE_FAILED_ANSWER}))
                }
                return advance(state, {packet: packet.data})
            })
        )
    }

    // --- apply + report: the terminal stage --------------------------------

    function applyAndReport$(state) {
        return updater.consult$({
            recipeId: state.recipeId,
            instruction: state.instruction,
            packet: state.packet,
            context: state.context
        }).pipe(
            mergeMap(result => isChannelEmission(result) ? of(result) : finalize$(state, result).pipe(map(done)))
        )
    }

    function finalize$(state, result) {
        const outcome = projectUpdateOutcome(result.timeline)
        const rawAnswer = result?.answer || ''
        if (outcome.succeeded && shouldFallbackToSummary(result, rawAnswer)) {
            return summarizeUpdate$({
                llm,
                conversationId: state.context?.conversationId,
                recipeId: state.recipeId,
                instruction: state.instruction,
                recipeType: state.recipeType, recipeName: state.recipeName,
                outcome, packet: state.packet
            }).pipe(map(summary => publishOutcome(state, outcome, summary.trim() || outcome.successSummary)))
        }
        return of(publishOutcome(state, outcome, rawAnswer))
    }

    function shouldFallbackToSummary(result, rawAnswer) {
        return !rawAnswer.trim() || wasCapped(result)
    }

    function publishOutcome(state, outcome, answer) {
        return publishOutcomeAndShape({
            outcome, answer, bus,
            conversationId: state.context?.conversationId, recipeId: state.recipeId
        })
    }

    // --- failure reporting -------------------------------------------------

    function failPreflight(state, envelope) {
        const code = envelope.error?.code
        return fail(state, {
            code,
            message: envelope.error?.message,
            answer: code === 'RECIPE_NOT_FOUND' ? NOT_FOUND_ANSWER : LOOKUP_FAILED_ANSWER
        })
    }

    function fail(state, {code, message, answer}) {
        publishUpdateRecipeOutcome({
            bus,
            conversationId: state.context?.conversationId,
            recipeId: state.recipeId,
            attempted: false, succeeded: false,
            code, lastPatchErrorCode: null,
            answerChars: answer.length
        })
        return {ok: false, error: {code, message, answer}}
    }
}

// --- stage runner --------------------------------------------------------

// Each stage emits one of:
//   {state: nextState}   advance
//   {done: envelope}     short-circuit with the final envelope
// or a channel emission that flows through to the consumer untouched.
// The terminal stage is the only one that always emits {done}. The `done`
// wrapper rides through to the end so downstream stages recognize it as a
// short-circuit; the final unwrap surfaces the envelope to the caller.
function runStages$(initial, stages) {
    const chained$ = stages.reduce(
        (chain$, stage) => chain$.pipe(mergeMap(step => {
            if (isChannelEmission(step)) return of(step)
            if ('done' in step) return of(step)
            return stage(step.state)
        })),
        of({state: initial})
    )
    return chained$.pipe(map(step => isChannelEmission(step) ? step : step.done))
}

function advance(state, extra) {
    return {state: {...state, ...extra}}
}

function done(envelope) {
    return {done: envelope}
}

module.exports = {createUpdateWorkflow}
