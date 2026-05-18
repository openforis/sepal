// Handler for the 'message' command. Runs each user message turn
// end-to-end: GUI context resolution, conversation lookup,
// persistOrTouch, turn-boundary channel events, conversation loop,
// title generation off-tail.

const {concat, concatMap, defer, from, of} = require('rxjs')
const {emitOnEnd} = require('../emitOnEnd')
const {
    assistantNotice, chatResponseComplete, chatResponseDelta,
    isChannelEmission, status, toolEnd, toolStart, userMessage
} = require('../channelEvents')

function createMessageHandler({conversations, guiContexts, titleGenerator, clock}) {
    return {handle$}

    function handle$({conversationId, text, clientId, subscriptionId, guiContext: messageGuiContext}) {
        const guiContext = messageGuiContext ?? guiContexts.get(clientId, subscriptionId)
        const toolContext = {conversationId, clientId, subscriptionId, guiContext}
        return conversations.get$(conversationId).pipe(
            concatMap(conversation => conversations.persistOrTouch$(conversationId, clock.nowIso()).pipe(
                concatMap(() => runTurn$({conversation, conversationId, text, guiContext, toolContext}))
            ))
        )
    }

    function runTurn$({conversation, conversationId, text, guiContext, toolContext}) {
        return concat(
            from([status(conversationId), userMessage(conversationId, text)]),
            conversation.sendUserMessage$(text, {guiContext, toolContext}).pipe(
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

module.exports = {createMessageHandler}
