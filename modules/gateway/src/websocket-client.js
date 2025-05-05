const {WebSocket} = require('ws')

const {clientTag, eventTag, userTag} = require('./tag')

const log = require('#sepal/log').getLogger('websocket/client')

const Clients = () => {
    const clients = {}

    const get = clientId => {
        const client = clients[clientId]
        if (clientId && client) {
            return client
        } else {
            throw new Error(`Unknown ${clientTag('', clientId)}`)
        }
    }

    const add = (username, clientId, ws) => {
        clients[clientId] = {username, ws, subscriptions: {}}
        log.debug(`${clientTag(username, clientId)} added to clients, now ${Object.keys(clients).length}`)
    }

    const remove = clientId => {
        try {
            const {username, ws} = get(clientId)
            ws.terminate()
            delete clients[clientId]
            log.debug(`${clientTag(username, clientId)} removed from clients, now ${Object.keys(clients).length}`)
        } catch (error) {
            log.debug(`Cannot remove client - ${error.message}`)
        }
    }

    const addSubscription = (clientId, subscriptionId, module) => {
        try {
            const {username, subscriptions} = get(clientId)
            subscriptions[subscriptionId] = module
            log.debug(`${clientTag(username, clientId)} subscribed to ${module}, now ${Object.keys(subscriptions).length}`)
        } catch (error) {
            log.debug(`Cannot add subscription - ${error.message}`)
        }
    }

    const removeSubscription = (clientId, subscriptionId) => {
        try {
            const {username, subscriptions} = get(clientId)
            const module = subscriptions[subscriptionId]
            delete subscriptions[subscriptionId]
            log.debug(`${clientTag(username, clientId)} unsubscribed from ${module}, now ${Object.keys(subscriptions).length}`)
        } catch (error) {
            log.debug(`Cannot remove subscription - ${error.message}`)
        }
    }

    const getSubscriptions = clientId => {
        try {
            const {subscriptions} = get(clientId)
            return subscriptions
        } catch (error) {
            log.debug(`Cannot get subscriptions - ${error.message}`)
            return {}
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

    const sendByClientId = ({module, clientId}, message) => {
        Object.entries(getSubscriptions(clientId))
            .filter(([, currentModule]) => !module || currentModule === module)
            .map(([subscriptionId]) => subscriptionId)
            .forEach(subscriptionId => send(clientId, {subscriptionId, ...message}))
    }

    const sendByUsername = ({module, username}, message) => {
        Object.entries(clients)
            .filter(([_, {username: currentUsername}]) => !username || currentUsername === username)
            .map(([clientId]) => clientId)
            .forEach(clientId => sendByClientId({module, clientId}, message))
    }

    const sendEvent = (username, type, data) => {
        log.info(`Sending ${eventTag(type)} to ${userTag(username)}`)
        Object.entries(clients)
            .filter(([_, {username: currentUsername}]) => currentUsername === username)
            .map(([clientId]) => clientId)
            .forEach(clientId => send(clientId, {event: {type, data}}))
    }

    const broadcastEvent = (type, data) => {
        log.info(`Sending ${eventTag(type)} to all clients`)
        Object.entries(clients)
            .map(([clientId]) => clientId)
            .forEach(clientId => send(clientId, {event: {type, data}}))
    }

    const forEach = callback => {
        log.debug('Iterating clients')
        Object.entries(clients).forEach(
            ([clientId, {username, ws}]) => callback({username, clientId, ws})
        )
    }

    const forEachUser = callback => {
        log.debug('Iterating users')
        const usernames = [...new Set(Object.values(clients).map(({username}) => username))]
        return usernames.forEach(username => callback(username))
    }

    return {add, remove, addSubscription, removeSubscription, getSubscriptions, send, broadcast, forEach, forEachUser, sendByUsername, sendEvent, broadcastEvent}
}

module.exports = {Clients}
