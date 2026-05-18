// Orchestrates one user-turn end to end: resolves the per-tab selection
// fallback, gets/loads the Conversation, drains pending → persisted (or
// touches updatedAt), emits the turn-start channel notifications, runs
// the Conversation's turn loop, routes each event to the channel,
// emits the turn-complete notification, then runs the title generator
// off-tail so a slow title doesn't delay the next turn.

const {EMPTY, concat, concatMap, defer, finalize, ignoreElements, map, tap} = require('rxjs')

function createTurnFlow({conversations, tabContexts, titleGenerator, clock}) {
    return {send$}

    function send$({channel, conversationId, text, clientId, subscriptionId, selection: messageSelection}) {
        const selection = messageSelection ?? tabContexts.get(clientId, subscriptionId)
        const toolContext = {channel, conversationId, clientId, subscriptionId, selection}
        return conversations.get$(conversationId).pipe(
            concatMap(conversation => conversations.persistOrTouch$(conversationId, clock.nowIso()).pipe(
                map(() => conversation)
            )),
            concatMap(conversation => runTurn$({channel, conversation, conversationId, text, selection, toolContext}))
        )
    }

    function runTurn$({channel, conversation, conversationId, text, selection, toolContext}) {
        return concat(
            defer(() => {
                channel.status(conversationId)
                channel.userMessage(conversationId, text)
                return EMPTY
            }),
            conversation.sendUserMessage$(text, {selection, toolContext}).pipe(
                tap(event => routeTurnEvent(channel, conversationId, event)),
                finalize(() => channel.chatResponse({conversationId, complete: true})),
                ignoreElements()
            ),
            defer(() => titleGenerator.afterTurn$({channel, conversation, conversationId, userText: text}))
        )
    }
}

function routeTurnEvent(channel, conversationId, event) {
    if (event.toolStart) {
        channel.toolStart({conversationId, ...event.toolStart})
    } else if (event.toolEnd) {
        channel.toolEnd({conversationId, ...event.toolEnd})
    } else if (event.notice) {
        channel.assistantNotice({conversationId, ...event.notice})
    } else {
        channel.chatResponse({conversationId, ...event})
    }
}

module.exports = {createTurnFlow}
