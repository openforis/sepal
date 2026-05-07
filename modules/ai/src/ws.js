const {Subject, from, switchMap, startWith} = require('rxjs')
const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('ws')
const {createOrchestrator} = require('./chat/orchestrator')

const GUI_REQUEST_TIMEOUT_MS = 15000

const createWsHandler = ({config, registry, conversationStore}) => {

    const ws$ = in$ => {
        const out$ = new Subject()
        const pendingRequests = new Map()

        const send = ({username, clientId, subscriptionId, data}) => {
            out$.next({username, clientId, subscriptionId, data})
        }

        const broadcast = ({username, excludeClientId, data}) => {
            out$.next({username, excludeClientId, data})
        }

        // Send a request to the GUI and await a matching gui-response.
        // The GUI must echo back the requestId on a {type: 'gui-response', requestId, success, data?, error?} message.
        const request = ({username, clientId, subscriptionId, data, timeoutMs = GUI_REQUEST_TIMEOUT_MS}) =>
            new Promise((resolve, reject) => {
                const requestId = uuid()
                const timer = setTimeout(() => {
                    if (pendingRequests.delete(requestId)) {
                        reject(new Error(`GUI request timed out after ${timeoutMs}ms (action=${data && data.action})`))
                    }
                }, timeoutMs)
                pendingRequests.set(requestId, {resolve, reject, timer})
                out$.next({username, clientId, subscriptionId, data: {...data, requestId}})
            })

        const resolveRequest = ({requestId, success, data, error}) => {
            const pending = pendingRequests.get(requestId)
            if (!pending) {
                log.warn(`Received gui-response for unknown requestId: ${requestId}`)
                return
            }
            pendingRequests.delete(requestId)
            clearTimeout(pending.timer)
            if (success === false) {
                pending.reject(new Error(error || 'GUI request failed'))
            } else {
                pending.resolve(data)
            }
        }

        const response = {send, broadcast, request}

        const init = async () => {
            const {sessionHandler, conversationHandler, messageHandler} = createOrchestrator({response, config, registry, conversationStore})

            const EVENT_HANDLERS = {
                subscriptionUp: ({user: {username}, clientId, subscriptionId}) => {
                    log.info(`Subscription up: ${clientId}:${subscriptionId} (${username})`)
                    sessionHandler.createSession({username, clientId, subscriptionId})
                        .catch(error => log.error('Create session error:', error))
                },
                subscriptionDown: ({user: {username}, clientId, subscriptionId}) => {
                    log.info(`Subscription down: ${clientId}:${subscriptionId} (${username})`)
                    sessionHandler.removeSession({clientId, subscriptionId})
                },
                clientDown: ({user: {username}, clientId}) => {
                    log.info(`Client down: ${clientId} (${username})`)
                    sessionHandler.removeClientSessions({clientId})
                }
            }

            const processMessage = message => {
                const {event, data, hb, user, clientId, subscriptionId} = message
                if (hb) {
                    out$.next({hb})
                } else if (event) {
                    const handler = EVENT_HANDLERS[event]
                    if (handler) {
                        handler({user, clientId, subscriptionId})
                    } else {
                        log.trace('Unhandled event (ignored):', event)
                    }
                } else if (data) {
                    const {type, text, conversationId, requestId} = data
                    const {username, admin} = user
                    if (admin) {
                        if (type === 'gui-response') {
                            resolveRequest({requestId, success: data.success, data: data.data, error: data.error})
                        } else if (type === 'message') {
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
                        log.warn('Not allowed (non-admin):', username)
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
                    pendingRequests.forEach(({reject, timer}) => {
                        clearTimeout(timer)
                        reject(new Error('WebSocket disconnected'))
                    })
                    pendingRequests.clear()
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
