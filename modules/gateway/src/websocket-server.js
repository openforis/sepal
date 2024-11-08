const {moduleTag} = require('./tag')
const log = require('#sepal/log').getLogger('websocket/server')

const Servers = () => {
    const servers = {}

    const add = (module, upstream$, subscriptions) => {
        if (!servers[module]) {
            servers[module] = {upstream$, subscriptions}
            log.debug(`${moduleTag(module)} added to servers, now ${Object.keys(servers).length}`)
        } else {
            log.error(`${moduleTag(module)} cannot be added to servers`)
        }
    }

    const remove = module => {
        const server = servers[module]
        if (server) {
            server.subscriptions.forEach(subscription => subscription.unsubscribe())
            delete servers[module]
            log.debug(`${moduleTag(module)} removed from servers, now ${Object.keys(servers).length}`)
        } else {
            log.error(`${moduleTag(module)} cannot be removed from servers`)
        }
    }

    const list = () =>
        Object.keys(servers)

    const send = (module, message) => {
        const server = servers[module]
        if (server) {
            log.debug(`Sending message to ${moduleTag(module)}`)
            server.upstream$.next(message)
        } else {
            log.error(`Cannot send message to non-existing ${moduleTag(module)}`)
        }
    }

    const broadcast = message => {
        log.debug('Sending message to all modules')
        Object.keys(servers).forEach(
            module => send(module, message)
        )
    }

    return {add, remove, list, send, broadcast}
}

module.exports = {Servers}
