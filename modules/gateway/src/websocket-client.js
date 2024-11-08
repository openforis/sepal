const {WebSocket} = require('ws')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('websocket/client')

const Clients = () => {
    const clients = {}

    const add = (user, ws, subscriptions) => {
        const username = user.username
        if (!clients[username]) {
            clients[username] = {user, ws, subscriptions}
            log.debug(`${userTag(username)} added to clients, now ${Object.keys(clients).length}`)
        } else {
            log.error(`${userTag(username)} cannot be added to clients`)
        }
    }

    const remove = username => {
        const client = clients[username]
        if (client) {
            client.subscriptions.forEach(subscription => subscription.unsubscribe())
            delete clients[username]
            log.debug(`${userTag(username)} removed from clients, now ${Object.keys(clients).length}`)
        } else {
            log.error(`${userTag(username)} cannot be removed from clients`)
        }
    }

    const forEach = callback => {
        log.debug('Iterating clients')
        Object.values(clients).forEach(
            ({user, ws}) => callback(user, ws)
        )
    }

    const send = (username, message) => {
        const client = clients[username]
        if (client) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message))
            } else {
                log.warn('Cannot send message to non-open WebSocket', message)
            }
        } else {
            log.warn(`Cannot send message to non-existing ${userTag(username)}`, message)
        }
    }

    const broadcast = message => {
        log.debug('Sending message to all clients')
        Object.keys(clients).forEach(
            username => send(username, message)
        )
    }

    return {add, remove, forEach, send, broadcast}
}

module.exports = {Clients}
