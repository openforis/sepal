const {WebSocket} = require('ws')
const {Subject} = require('rxjs')

const {clientTag} = require('./tag')

const log = require('#sepal/log').getLogger('websocket/client')

const Clients = () => {
    const clients = {}
    const remove$ = new Subject()

    const get = clientId => {
        const client = clients[clientId]
        if (clientId && client) {
            return client
        } else {
            throw new Error(`Unknown ${clientTag('', clientId)}`)
        }
    }

    const add = (user, clientId, ws, subscriptions) => {
        const username = user.username
        clients[clientId] = {user, ws, subscriptions}
        log.debug(`${clientTag(username, clientId)} added to clients, now ${Object.keys(clients).length}`)
    }

    const remove = clientId => {
        try {
            const {user, subscriptions} = get(clientId)
            subscriptions.forEach(subscription => subscription.unsubscribe())
            delete clients[clientId]
            remove$.next(clientId)
            log.debug(`${clientTag(user?.username, clientId)} removed from clients, now ${Object.keys(clients).length}`)
        } catch (error) {
            log.debug(`Cannot remove client - ${error.message}`)
        }
    }

    const send = (clientId, message) => {
        try {
            const {ws} = get(clientId)
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message))
            } else {
                log.warn('Cannot send message to non-open WebSocket', message)
            }
        } catch (error) {
            log.debug(`Cannot send message - ${error.message}`)
        }
    }

    const broadcast = message => {
        log.debug('Sending message to all clients')
        Object.keys(clients).forEach(
            clientId => send(clientId, message)
        )
    }

    const forEach = callback => {
        log.debug('Iterating clients')
        Object.entries(clients).forEach(
            ([clientId, {user, ws}]) => callback({user, clientId, ws})
        )
    }

    return {add, remove, remove$, send, broadcast, forEach}
}

module.exports = {Clients}
