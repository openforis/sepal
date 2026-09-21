import {WebSocket} from 'ws'

import {getLogger} from '#sepal/log'

import {clientTag, eventTag, userTag} from './tag.js'

const log = getLogger('websocket/client')

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

    const add = (username, clientId, ws, sessionId) => {
        clients[clientId] = {username, ws, sessionId, subscriptions: {}}
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

    const send = (clientId, message, onSent) => {
        try {
            const {ws} = get(clientId)
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message), onSent)
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

    const sendByUsername = ({module, username}, message) => {
        Object.entries(clients)
            .filter(([_, {username: currentUsername}]) => currentUsername === username)
            .map(([clientId]) => clientId)
            .forEach(clientId => send(clientId, {module, ...message}))
    }

    const sendEventToUser = (username, type, data) => {
        log.debug(`Sending ${eventTag(type)} to ${userTag(username)}`)
        sendEvent({type, data, username})
    }

    const sendEventToClient = (username, clientId, type, data) => {
        log.debug(`Sending ${eventTag(type)} to ${clientTag(username, clientId)}`)
        sendEvent({type, data, username, clientId})
    }

    const broadcastEvent = (type, data) => {
        log.debug(`Sending ${eventTag(type)} to all clients`)
        sendEvent({type, data})
    }

    // The login session that authenticated these sockets is gone, so they are closed — but only
    // once the event has left, so the tab learns why before its reconnect attempts start failing.
    const sendEventToSession = (sessionId, type, data) => {
        log.debug(`Sending ${eventTag(type)} to clients of session ${sessionId}, then closing them`)
        Object.entries(clients)
            .filter(([_, {sessionId: currentSessionId}]) => currentSessionId === sessionId)
            .forEach(([clientId, {ws}]) => send(clientId, {event: {type, data}}, () => ws.close()))
    }

    const sendEvent = ({type, data, username, clientId}) =>
        Object.entries(clients)
            .filter(([currentClientId, {username: currentUsername}]) =>
                (!clientId || currentClientId === clientId) && (!username || currentUsername === username))
            .map(([clientId]) => clientId)
            .forEach(clientId => send(clientId, {event: {type, data}}))

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

    return {add, get, remove, addSubscription, removeSubscription, getSubscriptions, send, broadcast, forEach, forEachUser, sendByUsername, sendEventToUser, sendEventToClient, sendEventToSession, broadcastEvent}
}

export {Clients}
