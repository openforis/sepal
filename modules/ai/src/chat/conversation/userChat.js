// Per-user chat dispatcher. Maps wire-typed commands to the right
// collaborator (conversations, tabContexts, turnFlow), wraps the
// resulting work in a tracing span so command lifecycle (started /
// completed / failed) is visible on the bus, and publishes a warn
// event for unrecognised types. Holds no state and no orchestration
// of its own.

const {EMPTY} = require('rxjs')

function createUserChat({conversations, tabContexts, turnFlow, tracer, bus}) {
    const dispatch = {
        'create-conversation':      conversations.create$,
        'select-conversation':      conversations.select$,
        'delete-conversation':      conversations.delete$,
        'delete-all-conversations': conversations.deleteAll$,
        'list-conversations':       conversations.list$,
        'message':                  turnFlow.send$,
        'abort':                    conversations.abort$,
        'context':                  tabContexts.update$,
        'clear-context':            tabContexts.clear$
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
