// Orchestrates one user-turn end to end: resolves the per-tab selection
// fallback, gets/loads the Conversation, drains pending → persisted (or
// touches updatedAt), emits the turn-start channel events, runs the
// Conversation's turn loop translating its domain events into channel
// events, always emits chat-response complete at the end, then runs
// the title generator off-tail so a slow title doesn't delay the next
// turn.

const {concat, concatMap, defer, from, of} = require('rxjs')
const {emitOnEnd} = require('../emitOnEnd')
const {
    assistantNotice, chatResponseComplete, chatResponseDelta,
    isChannelEmission, status, toolEnd, toolStart, userMessage
} = require('../channelEvents')

function createTurnFlow({conversations, tabContexts, titleGenerator, clock}) {
    return {send$}

    function send$({conversationId, text, clientId, subscriptionId, selection: messageSelection}) {
        const selection = messageSelection ?? tabContexts.get(clientId, subscriptionId)
        const toolContext = {conversationId, clientId, subscriptionId, selection}
        return conversations.get$(conversationId).pipe(
            concatMap(conversation => conversations.persistOrTouch$(conversationId, clock.nowIso()).pipe(
                concatMap(() => runTurn$({conversation, conversationId, text, selection, toolContext}))
            ))
        )
    }

    function runTurn$({conversation, conversationId, text, selection, toolContext}) {
        return concat(
            from([status(conversationId), userMessage(conversationId, text)]),
            conversation.sendUserMessage$(text, {selection, toolContext}).pipe(
                concatMap(event => of(routeTurnEvent(conversationId, event))),
                emitOnEnd(chatResponseComplete(conversationId))
            ),
            defer(() => titleGenerator.afterTurn$({conversation, conversationId, userText: text}))
        )
    }
}

function routeTurnEvent(conversationId, value) {
    if (isChannelEmission(value)) return value.event
    if (value.toolStart) return toolStart({conversationId, ...value.toolStart})
    if (value.toolEnd) return toolEnd({conversationId, ...value.toolEnd})
    if (value.notice) return assistantNotice({conversationId, ...value.notice})
    return chatResponseDelta(conversationId, value.textDelta)
}

module.exports = {createTurnFlow}
