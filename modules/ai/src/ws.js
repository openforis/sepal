const {Subject, from, switchMap, startWith} = require('rxjs')
const log = require('#sepal/log').getLogger('ws')
const {createOrchestrator} = require('./chat/orchestrator')

const createWsHandler = ({config, registry, conversationStore}) => {

    const ws$ = in$ => {
        const out$ = new Subject()

        const send = ({username, clientId, subscriptionId, data}) => {
            out$.next({username, clientId, subscriptionId, data})
        }

        const broadcast = ({username, excludeClientId, data}) => {
            out$.next({username, excludeClientId, data})
        }
        
        const response = {send, broadcast}
        
        const init = async () => {
            const {sessionHandler, conversationHandler, messageHandler} = createOrchestrator({response, config, registry, conversationStore})

            const EVENT_HANDLERS = {
                subscriptionUp: ({username, clientId, subscriptionId}) => {
                    log.info(`Subscription up: ${clientId}:${subscriptionId} (${username})`)
                    sessionHandler.createSession({username, clientId, subscriptionId})
                        .catch(error => log.error('Create session error:', error))
                },
                subscriptionDown: ({username, clientId, subscriptionId}) => {
                    log.info(`Subscription down: ${clientId}:${subscriptionId} (${username})`)
                    sessionHandler.removeSession({clientId, subscriptionId})
                },
                clientDown: ({username, clientId}) => {
                    log.info(`Client down: ${clientId} (${username})`)
                    sessionHandler.removeClientSessions({clientId})
                }
            }

            const processMessage = message => {
                const {event, data, hb, username, clientId, subscriptionId} = message
                if (hb) {
                    out$.next({hb})
                } else if (event) {
                    const handler = EVENT_HANDLERS[event]
                    if (handler) {
                        handler({username, clientId, subscriptionId})
                    } else {
                        log.trace('Unhandled event (ignored):', event)
                    }
                } else if (data) {
                    const {type, text, conversationId} = data
                    if (type === 'message') {
                        messageHandler.handleMessage({username, clientId, subscriptionId, text})
                            .catch(error => log.error('Message handling error:', error))
                    } else if (type === 'list-conversations') {
                        conversationHandler.listConversations({username, clientId, subscriptionId})
                            .catch(error => log.error('List conversations error:', error))
                    } else if (type === 'create-conversation') {
                        conversationHandler.createConversation({username, clientId, subscriptionId})
                    } else if (type === 'select-conversation') {
                        conversationHandler.selectConversation({username, clientId, subscriptionId, conversationId})
                            .catch(error => log.error('Select conversation error:', error))
                    } else if (type === 'delete-conversation') {
                        conversationHandler.deleteConversation({username, clientId, subscriptionId, conversationId})
                            .catch(error => log.error('Delete conversation error:', error))
                    } else if (type === 'delete-all-conversations') {
                        conversationHandler.deleteAllConversations({username, clientId, subscriptionId})
                            .catch(error => log.error('Delete all conversations error:', error))
                    } else {
                        log.warn('Unsupported message type:', type)
                    }
                } else {
                    log.warn('Unsupported message:', message)
                }
            }

            in$.subscribe({
                next: msg => processMessage(msg),
                error: error => log.error('Connection error (unexpected)', error),
                complete: () => {
                    log.info('Disconnected')
                    sessionHandler.shutdown()
                }
            })
        }

        return from(init()).pipe(
            switchMap(() => out$.pipe(startWith({ready: true})))
        )
    }

    return ctx => ws$(ctx.arg$)
}

module.exports = {createWsHandler}
