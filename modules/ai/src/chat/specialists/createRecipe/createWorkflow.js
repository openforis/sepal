// create_recipe — handle-based vertical slice. Mirrors updateWorkflow's
// stage chain but starts from defaults (no recipe to load) and treats an
// empty picker output as success (prepare always pulls user-required
// handles into the writable set, so the updater still has a meaningful
// scope to act on or ask clarification about).
//
//   recipe-type validation (must have a handle catalog + spec)
//   -> pickHandles$           (one tool-free LLM call → handles; allowEmpty)
//   -> prepareCreatePacket$   (defaultModel → handle-keyed packet, always
//                              including user-required handles)
//   -> create specialist      (LLM loop, only create_recipe_values in scope,
//                              workflow-bound fields injected per attempt)
//   -> projectCreateOutcome   (timeline → user-facing envelope + diagnostic)
// JSON Pointer paths stay below the GUI/log boundary.

const {map, mergeMap, of} = require('rxjs')
const {getRecipeHandles, getRecipeSpec} = require('#recipes')
const {wasCapped} = require('../runSpecialist')
const {publishCreateRecipeOutcome} = require('../specialistEvents')
const {isChannelEmission} = require('../../channelEvents')
const {pickHandles$} = require('../updateRecipe/pickHandles')
const {prepareCreatePacket$} = require('./prepareCreatePacket')
const {projectCreateOutcome, publishOutcomeAndShape} = require('./createOutcome')
const {createRecipeCreateSpecialist} = require('./createSpecialist')

// directAnswer tools carry user-facing prose even when the attempt short-
// circuits, so the orchestrator can stream it without an answer-less restate.
const UNSUPPORTED_RECIPE_ANSWER = "I can't create that recipe type yet — only MOSAIC is supported."
const PICKER_FAILED_ANSWER = "I couldn't figure out which recipe fields your request was about. Please try rephrasing."
const PREPARE_FAILED_ANSWER = "I couldn't prepare that create right now. Please try again."

function createCreateWorkflow({llm, bus, innerTools}) {
    const specialist = createRecipeCreateSpecialist({llm, bus, innerTools})

    return {run$}

    function run$({recipeType, instruction, projectId, name, context}) {
        return runStages$({recipeType, instruction, projectId, name, context},
            [validateType$, intend$, scopeFor$, applyAndReport$])
    }

    // --- validateType: do we know how to create this? ----------------------

    function validateType$(state) {
        if (!getRecipeSpec(state.recipeType) || !getRecipeHandles(state.recipeType)) {
            return of(done(fail(state, {
                code: 'UNSUPPORTED_RECIPE_TYPE',
                message: `Recipe type ${state.recipeType} has no handle catalog or spec`,
                answer: UNSUPPORTED_RECIPE_ANSWER
            })))
        }
        return of(advance(state, {}))
    }

    // --- intend: which handles is the user asking about? -------------------

    function intend$(state) {
        return pickHandles$({
            llm, bus, flow: 'create', allowEmpty: true,
            recipeType: state.recipeType,
            instruction: state.instruction,
            conversationId: state.context?.conversationId
        }).pipe(
            map(picker => picker.ok === false
                ? done(fail(state, {code: picker.error.code, message: picker.error.message, answer: PICKER_FAILED_ANSWER}))
                : advance(state, {handles: picker.handles})
            )
        )
    }

    // --- scope: bound the write to picked + dependent + user-required ------

    function scopeFor$(state) {
        return prepareCreatePacket$({
            bus,
            recipeType: state.recipeType,
            pickedHandles: state.handles,
            conversationId: state.context?.conversationId
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
        return specialist.consult$({
            recipeType: state.recipeType,
            projectId: state.projectId,
            name: state.name,
            instruction: state.instruction,
            packet: state.packet,
            context: state.context
        }).pipe(
            mergeMap(result => isChannelEmission(result) ? of(result) : of(done(finalize(state, result))))
        )
    }

    function finalize(state, result) {
        const outcome = projectCreateOutcome(result.timeline)
        const rawAnswer = result?.answer || ''
        const capped = wasCapped(result)
        // Post-success empty/capped fallback. anyCreateApplied stops the
        // specialist as soon as create_recipe_values succeeds, so the model
        // often emits nothing visible after the success — and directToolAnswer
        // drops empty answers, leaving the user with no confirmation. Mirror
        // update's fallback: when create succeeded but final text is empty or
        // a cap sentinel, synthesize a deterministic "Created …" reply from
        // the workflow-bound identity and the inner tool's success summary.
        const answer = outcome.succeeded && shouldFallback(rawAnswer, capped)
            ? deterministicCreatedAnswer(state, outcome)
            : rawAnswer
        return publishOutcomeAndShape({
            outcome, answer, capped, bus,
            conversationId: state.context?.conversationId,
            recipeType: state.recipeType
        })
    }

    // --- failure reporting -------------------------------------------------

    function fail(state, {code, message, answer}) {
        publishCreateRecipeOutcome({
            bus,
            conversationId: state.context?.conversationId,
            recipeType: state.recipeType,
            recipeId: null,
            attempted: false, succeeded: false,
            code, lastToolErrorCode: null,
            answerChars: answer.length
        })
        return {ok: false, error: {code, message, answer}}
    }
}

function shouldFallback(rawAnswer, capped) {
    return !rawAnswer.trim() || capped
}

function deterministicCreatedAnswer(state, outcome) {
    const namePart = state.name ? `"${state.name}" ` : ''
    const head = `Created ${namePart}${humanRecipeType(state.recipeType)} recipe.`
    const summary = outcome.successSummary?.trim()
    return summary ? `${head} ${summary}` : head
}

function humanRecipeType(recipeType) {
    return recipeType === 'MOSAIC' ? 'mosaic' : recipeType.toLowerCase()
}

// --- stage runner --------------------------------------------------------

// Same shape as updateWorkflow's runStages$: each stage returns either
// {state: nextState} (advance), {done: envelope} (short-circuit), or a
// channel emission (passes through untouched). Final unwrap surfaces the
// envelope to the caller.
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

module.exports = {createCreateWorkflow}
