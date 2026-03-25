const {Subject, from, switchMap, startWith} = require('rxjs')
const log = require('#sepal/log').getLogger('ws')
const {createOrchestrator} = require('./chat/orchestrator')

const createWsHandler = ({config, registry, conversationStore}) => {

    const ws$ = in$ => {
        const out$ = new Subject()

        const init = async () => {
            const orchestrator = createOrchestrator({out$, config, registry, conversationStore})

            const EVENT_HANDLERS = {
                subscriptionUp: ({username, clientId, subscriptionId}) => {
                    log.info(`Subscription up: ${clientId}:${subscriptionId} (${username})`)
                    orchestrator.createSession({username, clientId, subscriptionId})
                        .catch(error => log.error('Create session error:', error))
                },
                subscriptionDown: ({username, clientId, subscriptionId}) => {
                    log.info(`Subscription down: ${clientId}:${subscriptionId} (${username})`)
                    orchestrator.removeSession({clientId, subscriptionId})
                },
                clientUp: ({username, clientId}) => log.debug(`Client up: ${clientId} (${username})`),
                clientDown: ({username, clientId}) => {
                    log.info(`Client down: ${clientId} (${username})`)
                    orchestrator.removeClientSessions({clientId})
                },
                userUp: ({username}) => log.debug(`User up: ${username}`),
                userDown: ({username}) => log.debug(`User down: ${username}`),
                userUpdated: ({username}) => log.debug(`User updated: ${username}`),
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
                        log.warn('Unhandled event:', event)
                    }
                } else if (data) {
                    const {type, text, conversationId} = data
                    if (type === 'message') {
                        orchestrator.handleMessage({username, clientId, subscriptionId, text})
                            .catch(error => log.error('Message handling error:', error))
                    } else if (type === 'list-conversations') {
                        orchestrator.listConversations({username, clientId, subscriptionId})
                            .catch(error => log.error('List conversations error:', error))
                    } else if (type === 'create-conversation') {
                        orchestrator.createConversation({username, clientId, subscriptionId})
                    } else if (type === 'select-conversation') {
                        orchestrator.selectConversation({username, clientId, subscriptionId, conversationId})
                            .catch(error => log.error('Select conversation error:', error))
                    } else if (type === 'delete-conversation') {
                        orchestrator.deleteConversation({username, clientId, subscriptionId, conversationId})
                            .catch(error => log.error('Delete conversation error:', error))
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
                    orchestrator.shutdown()
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
