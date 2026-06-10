import {map, mergeMap, of} from 'rxjs'

import {getRecipeHandles} from '#recipes'

import {isChannelEmission} from '../../channelEvents.js'
import {lookupRecipeMetadata$} from '../../tools/recipeMetadata.js'
import {wasCapped} from '../runSpecialist.js'
import {pickHandles$} from './pickHandles.js'
import {prepareHandlePacket$} from './prepareHandlePacket.js'
import {appendRescopeContext, combineTimelines, rescopeCandidates} from './rescope.js'
import {projectUpdateOutcome, publishOutcomeAndShape} from './updateOutcome.js'
import {publishUpdateRecipeOutcome, publishUpdateRecipeRequest} from './updateRecipeEvents.js'
import {createUpdateRecipeSpecialist} from './updateRecipeSpecialist.js'
import {summarizeUpdate$} from './updateSummary.js'

const NOT_FOUND_ANSWER = 'I couldn\'t find the recipe to update. It may have been closed, deleted, or not loaded in this session.'
const LOOKUP_FAILED_ANSWER = 'I couldn\'t look up the recipe to update right now. Please try again.'
const PICKER_FAILED_ANSWER = 'I couldn\'t figure out which recipe fields your request was about. Please try rephrasing.'
const PICKER_EMPTY_ANSWER = 'I\'m not sure which recipe setting to change for that. Do you want me to adjust inputs, dates, cloud masking, processing, or a specific setting?'
const UNSUPPORTED_RECIPE_ANSWER = 'This recipe type isn\'t supported by the chat updater yet.'
const PREPARE_FAILED_ANSWER = 'I couldn\'t prepare that update right now. Please try again.'

function createUpdateWorkflow({llm, bus, guiRequests, innerTools, updater = createUpdateRecipeSpecialist({llm, bus, innerTools})}) {

    return {run$}

    function run$({recipeId, request, contextText, instruction, context}) {
        const userRequest = request ?? instruction
        publishUpdateRecipeRequest({
            bus,
            conversationId: context?.conversationId,
            recipeId,
            request: userRequest,
            contextText,
            guiContext: context?.guiContext
        })
        return runStages$({recipeId, request: userRequest, contextText, context}, [identify$, intend$, scopeFor$, applyAndReport$])
    }

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

    function intend$(state) {
        return pickHandles$({
            llm, bus,
            recipeType: state.recipeType, recipeName: state.recipeName,
            request: state.request, context: state.contextText,
            conversationId: state.context?.conversationId
        }).pipe(map(picker => mapPickerResult(state, picker)))
    }

    function mapPickerResult(state, picker) {
        if (picker.ok === false) {
            if (picker.error?.code === 'PICKER_EMPTY') {
                return done(clarify(state, {diagnosticCode: 'PICKER_EMPTY', answer: PICKER_EMPTY_ANSWER}))
            }
            return done(fail(state, {code: picker.error.code, message: picker.error.message, answer: PICKER_FAILED_ANSWER}))
        }
        return advance(state, {handles: picker.handles})
    }

    function scopeFor$(state) {
        return prepareHandlePacket$({
            guiRequests, bus,
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

    function applyAndReport$(state) {
        return updater.consult$({
            recipeId: state.recipeId,
            request: state.request,
            contextText: state.contextText,
            packet: state.packet,
            context: state.context
        }).pipe(
            mergeMap(result => {
                if (isChannelEmission(result)) return of(result)
                const combinedTimeline = combineTimelines(state.priorTimeline, result.timeline)
                const outcome = projectUpdateOutcome(combinedTimeline)
                const missing = state.rescoped ? null : rescopeCandidates(outcome, state.packet, state.recipeType)
                if (missing) return rescopeAndRetry$(state, missing, outcome, combinedTimeline)
                return finalize$(state, result, combinedTimeline).pipe(map(done))
            })
        )
    }

    function rescopeAndRetry$(state, missingHandles, priorOutcome, priorTimeline) {
        const expandedHandles = distinct([...state.handles, ...missingHandles])
        return prepareHandlePacket$({
            guiRequests, bus,
            recipeId: state.recipeId,
            recipeType: state.recipeType,
            pickedHandles: expandedHandles,
            context: state.context
        }).pipe(
            mergeMap(packetResult => {
                if (isChannelEmission(packetResult)) return of(packetResult)
                if (packetResult.ok === false) {
                    return of(done(fail(state, {
                        code: packetResult.error.code,
                        message: packetResult.error.message,
                        answer: PREPARE_FAILED_ANSWER,
                        priorOutcome
                    })))
                }
                return applyAndReport$({
                    ...state,
                    handles: expandedHandles,
                    packet: packetResult.data,
                    rescoped: true,
                    priorTimeline,
                    contextText: appendRescopeContext(state.contextText, missingHandles, priorOutcome.lastError)
                })
            })
        )
    }

    function finalize$(state, result, combinedTimeline) {
        const outcome = projectUpdateOutcome(combinedTimeline)
        const rawAnswer = result?.answer || ''
        const capped = wasCapped(result)
        if (outcome.succeeded && shouldFallbackToSummary(rawAnswer, capped)) {
            return summarizeUpdate$({
                llm,
                conversationId: state.context?.conversationId,
                recipeId: state.recipeId,
                instruction: state.request,
                recipeType: state.recipeType, recipeName: state.recipeName,
                outcome, packet: state.packet
            }).pipe(map(summary => publishOutcome(state, outcome, summary.trim() || outcome.successSummary, {capped})))
        }
        return of(publishOutcome(state, outcome, rawAnswer, {capped}))
    }

    function shouldFallbackToSummary(rawAnswer, capped) {
        return !rawAnswer.trim() || capped
    }

    function publishOutcome(state, outcome, answer, {capped}) {
        return publishOutcomeAndShape({
            outcome, answer, capped, bus,
            conversationId: state.context?.conversationId, recipeId: state.recipeId
        })
    }

    function failPreflight(state, envelope) {
        const code = envelope.error?.code
        return fail(state, {
            code,
            message: envelope.error?.message,
            answer: code === 'RECIPE_NOT_FOUND' ? NOT_FOUND_ANSWER : LOOKUP_FAILED_ANSWER
        })
    }

    // priorOutcome is set only when a rescope re-prepare fails — the prior
    // consult's attempt rides through to the published outcome.
    function fail(state, {code, message, answer, priorOutcome}) {
        publishUpdateRecipeOutcome({
            bus,
            conversationId: state.context?.conversationId,
            recipeId: state.recipeId,
            attempted: priorOutcome?.attempted === true,
            succeeded: priorOutcome?.succeeded === true,
            code,
            lastPatchErrorCode: priorOutcome?.lastError?.code || null,
            answerChars: answer.length
        })
        return {ok: false, error: {code, message, answer}}
    }

    function clarify(state, {diagnosticCode, answer}) {
        publishUpdateRecipeOutcome({
            bus,
            conversationId: state.context?.conversationId,
            recipeId: state.recipeId,
            attempted: false, succeeded: false,
            code: 'CLARIFICATION_NEEDED', lastPatchErrorCode: null,
            answerChars: answer.length
        })
        return {
            ok: false,
            error: {
                code: 'CLARIFICATION_NEEDED',
                reason: diagnosticCode,
                message: 'The update workflow needs a clarification before proceeding.',
                answer
            }
        }
    }
}

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

function distinct(list) {
    return [...new Set(list)]
}

export {createUpdateWorkflow}
