// Wire-event vocabulary the chat slice emits to a subscription.
// Factories produce bare {kind, targeting, payload} events. In streams
// that mix channel events with arbitrary tool data, emitChannel wraps
// an event with an unforgeable Symbol marker; isChannelEmission
// detects the wrap. Pure-event streams carry bare events.

const {map} = require('rxjs')

const TARGETED = 'targeted'
const BROADCAST = 'broadcast'
const BROADCAST_EXCEPT = 'broadcastExcept'

const CHANNEL_EMISSION = Symbol('channel-emission')

function emitChannel(event) {
    return {[CHANNEL_EMISSION]: true, event}
}

function isChannelEmission(value) {
    return Boolean(value?.[CHANNEL_EMISSION])
}

// Pipe operator for streams that may interleave channel emissions and
// domain data — passes channel emissions through unchanged, applies fn
// to every other value.
function mapData(fn) {
    return map(value => isChannelEmission(value) ? value : fn(value))
}

function conversationCreated(meta) {
    return event('conversation-created', TARGETED, {conversationId: meta.id, ...withoutId(meta)})
}

function conversationClaimed(meta) {
    return event('conversation-claimed', BROADCAST_EXCEPT, {conversationId: meta.id, ...withoutId(meta)})
}

function conversationLoaded(conversationId, messages) {
    return event('conversation-loaded', TARGETED, {conversationId, messages})
}

function conversationUpdated(meta) {
    return event('conversation-updated', BROADCAST, {conversationId: meta.id, ...withoutId(meta)})
}

function conversationDeleted(conversationId) {
    return event('conversation-deleted', BROADCAST, {conversationId})
}

function conversationsList(conversations) {
    return event('conversations', TARGETED, {conversations})
}

function chatResponseDelta(conversationId, textDelta) {
    return event('chat-response', BROADCAST, {conversationId, text: textDelta})
}

function chatResponseComplete(conversationId) {
    return event('chat-response', BROADCAST, {conversationId, complete: true})
}

function status(conversationId) {
    return event('status', BROADCAST, {conversationId})
}

function userMessage(conversationId, text) {
    return event('user-message', BROADCAST_EXCEPT, {conversationId, text})
}

function toolStart({conversationId, toolCallId, toolName, input}) {
    return event('tool-start', BROADCAST, {conversationId, toolCallId, toolName, input})
}

function toolEnd({conversationId, toolCallId, toolName, ok, data, error}) {
    return event('tool-end', BROADCAST, {conversationId, toolCallId, toolName, ok, data, error})
}

function assistantNotice({conversationId, content, display}) {
    return event('assistant-notice', BROADCAST, {conversationId, content, display})
}

function guiAction({requestId, action, params}) {
    return event('gui-action', TARGETED, {requestId, action, params})
}

function conversationPendingActionCreated({conversationId, pendingAction, targeting = BROADCAST}) {
    return event('conversation-pending-action-created', targeting, {conversationId, pendingAction})
}

function conversationPendingActionCleared({conversationId, pendingActionId, reason}) {
    return event('conversation-pending-action-cleared', BROADCAST, {conversationId, pendingActionId, reason})
}

function pendingActionError({conversationId, pendingActionId, code, message}) {
    return event('pending-action-error', TARGETED, {conversationId, pendingActionId, code, message})
}

function event(kind, targeting, payload) {
    return {kind, targeting, payload}
}

function withoutId({id: _id, ...rest}) {
    return rest
}

module.exports = {
    TARGETED, BROADCAST, BROADCAST_EXCEPT,
    emitChannel, isChannelEmission, mapData,
    conversationCreated, conversationClaimed, conversationLoaded, conversationUpdated,
    conversationDeleted, conversationsList,
    chatResponseDelta, chatResponseComplete,
    status, userMessage,
    toolStart, toolEnd, assistantNotice,
    guiAction,
    conversationPendingActionCreated, conversationPendingActionCleared, pendingActionError
}
