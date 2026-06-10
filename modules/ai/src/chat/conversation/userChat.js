// Per-user chat dispatcher. Maps each wire-typed command to its
// handler observable, wraps the work in a bus.track$ span, and warns
// on unrecognised types.

import {EMPTY} from 'rxjs'

function createUserChat({conversations, guiContexts, messageHandler, pendingActions, bus}) {
    const dispatch = {
        'create-conversation': conversations.create$,
        'select-conversation': conversations.select$,
        'delete-conversation': conversations.delete$,
        'delete-all-conversations': conversations.deleteAll$,
        'list-conversations': conversations.list$,
        'message': messageHandler.handle$,
        'abort': conversations.abort$,
        'context': guiContexts.update$,
        'clear-context': guiContexts.clear$,
        'answer-pending-action': answerPendingAction$,
        'cancel-pending-action': pendingActions.cancel$
    }

    function answerPendingAction$(args) {
        return pendingActions.answer$({
            ...args,
            toolContext: toolContextFor(args)
        })
    }

    function toolContextFor({conversationId, clientId, subscriptionId}) {
        return {conversationId, clientId, subscriptionId, guiContext: guiContexts.get(clientId, subscriptionId)}
    }

    return {handle$}

    function handle$({type, ...args}) {
        const handler = dispatch[type]
        if (!handler) {
            bus.publish({
                type: 'userChat.unknownCommand',
                level: 'warn',
                message: `Unknown chat command: ${type}`,
                commandType: type
            })
            return EMPTY
        }
        return bus.track$('userChat.handle', {commandType: type}, handler(args))
    }
}

export {createUserChat}
