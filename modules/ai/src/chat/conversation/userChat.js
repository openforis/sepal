// Per-user chat dispatcher. Maps each wire-typed command to its
// handler observable, wraps the work in a tracing span, and warns on
// unrecognised types.

const {EMPTY} = require('rxjs')

function createUserChat({conversations, guiContexts, messageHandler, tracer, bus}) {
    const dispatch = {
        'create-conversation':      conversations.create$,
        'select-conversation':      conversations.select$,
        'delete-conversation':      conversations.delete$,
        'delete-all-conversations': conversations.deleteAll$,
        'list-conversations':       conversations.list$,
        'message':                  messageHandler.handle$,
        'abort':                    conversations.abort$,
        'context':                  guiContexts.update$,
        'clear-context':            guiContexts.clear$
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
        return tracer.span$('userChat.handle', {commandType: type}, handler(args))
    }
}

module.exports = {createUserChat}
