// One active pending action per conversation. Lives entirely outside the
// orchestrator LLM prompt/history — observed from tool results, answered or
// cancelled via explicit user commands, cleared on conversation deletion.
// Resume runs the original tool directly (no LLM round) with an augmented
// instruction; the tool's directAnswer flag streams the result to the user.

import {concat, defer, EMPTY, from, of} from 'rxjs'
import {concatMap, map} from 'rxjs/operators'

import {
    chatResponseComplete,
    conversationPendingActionCleared,
    conversationPendingActionCreated,
    emitChannel,
    pendingActionError,
    status,
    userMessage} from '../channelEvents.js'
import {routeTurnEvent} from './messageHandler.js'

// Tools whose CLARIFICATION_NEEDED outcome should be lifted into a
// resumable pending action. Both update_recipe and create_recipe go through
// the same shape: the resumed instruction preserves the original args
// (recipeId / recipeType / projectId / name / etc.) and augments instruction.
const CLARIFIABLE_TOOLS = new Set(['update_recipe', 'create_recipe'])

function createPendingActions({conversations, createId, clock}) {
    const byConversation = new Map()

    return {observeToolResult$, answer$, cancel$, clear, clientView, get}

    function observeToolResult$({conversationId, toolCall, result}) {
        if (!isClarificationNeeded(toolCall, result)) return EMPTY
        const previous = byConversation.get(conversationId)
        const pendingAction = {
            id: createId(),
            conversationId,
            toolName: toolCall.name,
            args: toolCall.input,
            question: result.error.answer,
            createdAt: clock.nowIso(),
            status: 'active'
        }
        byConversation.set(conversationId, pendingAction)
        const created = emitChannel(conversationPendingActionCreated({
            conversationId, pendingAction: forClient(pendingAction)
        }))
        if (!previous) return of(created)
        const cleared = emitChannel(conversationPendingActionCleared({
            conversationId, pendingActionId: previous.id, reason: 'replaced'
        }))
        return from([cleared, created])
    }

    function answer$({conversationId, pendingActionId, answer, toolContext}) {
        return defer(() => {
            const pending = activePending(conversationId, pendingActionId)
            if (!pending) return of(notFound(conversationId, pendingActionId))
            byConversation.delete(conversationId)
            const resumedToolCall = resumedCallFor(pending, answer)
            return concat(
                from([
                    conversationPendingActionCleared({
                        conversationId, pendingActionId: pending.id, reason: 'answered'
                    }),
                    status(conversationId),
                    userMessage(conversationId, answer)
                ]),
                resume$(conversationId, resumedToolCall, answer, toolContext),
                of(chatResponseComplete(conversationId))
            )
        })
    }

    // Mirror the normal message turn: touch the conversation's updatedAt
    // before running the resumed tool round, so list ordering stays consistent
    // with what the user did.
    function resume$(conversationId, toolCall, userAnswerText, toolContext) {
        return conversations.persistOrTouch$(conversationId, clock.nowIso()).pipe(
            concatMap(() => conversations.get$(conversationId)),
            concatMap(conversation => conversation.resumePendingTool$({toolCall, userAnswerText, toolContext})),
            map(turnEvent => routeTurnEvent(conversationId, turnEvent))
        )
    }

    function cancel$({conversationId, pendingActionId}) {
        return defer(() => {
            const pending = activePending(conversationId, pendingActionId)
            if (!pending) return of(notFound(conversationId, pendingActionId))
            byConversation.delete(conversationId)
            return of(conversationPendingActionCleared({
                conversationId, pendingActionId: pending.id, reason: 'cancelled'
            }))
        })
    }

    function clear(conversationId) {
        byConversation.delete(conversationId)
    }

    // Client-safe shape, used by select-conversation to surface an active
    // pending action to a reconnecting/new-tab client. In-memory only — a
    // server restart still loses it (persistence is a separate slice).
    function clientView(conversationId) {
        const pending = byConversation.get(conversationId)
        return pending ? forClient(pending) : null
    }

    function get(conversationId) {
        return byConversation.get(conversationId)
    }

    function activePending(conversationId, pendingActionId) {
        const pending = byConversation.get(conversationId)
        if (!pending || pending.id !== pendingActionId) return null
        return pending
    }

    function resumedCallFor(pending, answer) {
        // Write the augmented text back into whichever field the original
        // call carried it on — `request` for update_recipe's new contract,
        // `instruction` for create_recipe (and legacy update_recipe callers).
        const field = pending.args && 'request' in pending.args ? 'request' : 'instruction'
        return {
            id: createId(),
            name: pending.toolName,
            input: {...pending.args, [field]: augmentedInstruction(pending, answer)}
        }
    }
}

function isClarificationNeeded(toolCall, result) {
    return CLARIFIABLE_TOOLS.has(toolCall?.name)
        && result?.ok === false
        && result?.error?.code === 'CLARIFICATION_NEEDED'
        && typeof result.error.answer === 'string'
        && result.error.answer.trim().length > 0
}

function augmentedInstruction({args, question}, answer) {
    const original = args?.request ?? args?.instruction ?? ''
    return [
        `Original request: ${original}`,
        '',
        `Clarification question: ${question}`,
        `Clarification answer: ${answer}`
    ].join('\n')
}

function forClient(pending) {
    return {id: pending.id, toolName: pending.toolName, question: pending.question}
}

function notFound(conversationId, pendingActionId) {
    return pendingActionError({
        conversationId, pendingActionId,
        code: 'PENDING_ACTION_NOT_FOUND',
        message: 'No active pending action matched this id.'
    })
}

// An inert pendingActions for code paths that don't exercise pending-action
// behaviour (mainly tests). Has the full shape so consumers never null-check.
const noPendingActions = {
    observeToolResult$: () => EMPTY,
    answer$: () => EMPTY,
    cancel$: () => EMPTY,
    clear() {},
    clientView() { return null },
    get() { return undefined }
}

export {createPendingActions, noPendingActions}
