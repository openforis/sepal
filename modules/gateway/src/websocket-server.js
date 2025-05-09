const {moduleTag, eventTag} = require('./tag')

const log = require('#sepal/log').getLogger('websocket/server')

const Servers = () => {
    const servers = {}

    const get = module => {
        const server = servers[module]
        if (server) {
            return server
        } else {
            throw new Error(`Unknown ${moduleTag(module)}`)
        }
    }

    const add = (module, upstream$, subscriptions) => {
        if (!servers[module]) {
            servers[module] = {upstream$, subscriptions}
            log.debug(`${moduleTag(module)} added to servers, now ${Object.keys(servers).length}`)
        } else {
            log.error(`${moduleTag(module)} cannot be added to servers`)
        }
    }

    const remove = module => {
        try {
            const {subscriptions} = get(module)
            subscriptions.forEach(subscription => subscription.unsubscribe())
            delete servers[module]
            log.debug(`${moduleTag(module)} removed from servers, now ${Object.keys(servers).length}`)
        } catch (error) {
            log.error(`Cannot remove server - ${error.message}`)
        }
    }

    const list = () =>
        Object.keys(servers)

    const send = (module, message) => {
        try {
            const {upstream$} = get(module)
            log.debug(`Sending message to ${moduleTag(module)}`)
            upstream$.next(message)
        } catch (error) {
            log.error(`Cannot send message - ${error.message}`)
        }
    }

    const sendEvent = (module, type, data) => {
        log.debug(`Sending ${eventTag(type)} to ${moduleTag(module)}:`)
        send(module, {event: type, ...data}) // change to {event: {type, data}}
    }

    const broadcastEvent = (type, data) => {
        log.debug(`Broadcasting ${eventTag(type)} to all modules:`)
        Object.keys(servers).forEach(
            module => send(module, {event: type, ...data}) // change to {event: {type, data}}
        )
    }

    return {add, remove, list, send, sendEvent, broadcastEvent}
}

module.exports = {Servers}
