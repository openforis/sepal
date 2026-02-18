const {userTag, clientTag, subscriptionTag, moduleTag} = require('./tag')
const {firstValueFrom} = require('rxjs')

const log = require('#sepal/log').getLogger('websocket/event')

const {
    MODULE_UP,
    MODULE_DOWN,
    USER_UP,
    USER_DOWN,
    USER_UPDATED,
    CLIENT_UP,
    CLIENT_DOWN,
    CLIENT_VERSION_MISMATCH,
    SUBSCRIPTION_UP,
    SUBSCRIPTION_DOWN,
    GOOGLE_ACCESS_TOKEN_ADDED,
    GOOGLE_ACCESS_TOKEN_UPDATED,
    GOOGLE_ACCESS_TOKEN_REMOVED,
} = require('#sepal/event/definitions')

// const initializeEvents = ({servers, clients, userStore, event$, userUp$, userDown$, clientUp$, clientDown$}) => {
const initializeEvents = ({servers, clients, userStore, event$}) => {

    const moduleUp = ({module}) => {
        log.debug(`${moduleTag(module)} up`)
        clients.broadcastEvent(MODULE_UP, {module})
        clients.broadcast({modules: {update: {[module]: true}}})
        clients.forEachUser(username =>
            firstValueFrom(userStore.getUser$(username)).then(
                user => servers.sendEvent(module, USER_UP, {user})
            ).catch(
                error => log.warn(`${userTag(username)} Failed to get user on module up`, error)
            )
        )
        clients.forEach(({username, clientId}) =>
            servers.sendEvent(module, CLIENT_UP, {username, clientId})
        )
    }

    const moduleDown = ({module}) => {
        log.debug(`${moduleTag(module)} down`)
        clients.broadcastEvent(MODULE_DOWN, {module})
        clients.broadcast({modules: {update: {[module]: false}}})
    }

    const userUp = ({user}) => {
        log.debug(`${userTag(user.username)} up`)
        servers.broadcastEvent(USER_UP, {user})
        // userUp$.next(user)
    }

    const userDown = ({user}) => {
        log.debug(`${userTag(user.username)} down`)
        servers.broadcastEvent(USER_DOWN, {user})
        // userDown$.next(user)
    }

    const userUpdated = ({user}) => {
        log.debug(`${userTag(user.username)} updated`)
        servers.broadcastEvent(USER_UPDATED, {user})
        clients.sendEventToUser(user.username, USER_UPDATED)
    }

    const clientUp = ({username, clientId}) => {
        log.debug(`${clientTag(username, clientId)} up`)
        servers.broadcastEvent(CLIENT_UP, {username, clientId})
        // clientUp$.next({username, clientId})
    }
    
    const clientDown = ({username, clientId}) => {
        log.debug(`${clientTag(username, clientId)} down`)
        servers.broadcastEvent(CLIENT_DOWN, {username, clientId})
        // clientDown$.next({username, clientId})
    }
    
    const clientVersionMismatch = ({username, clientId}) => {
        log.debug(`${clientTag(username, clientId)} version mismatch`)
        clients.sendEventToClient(username, clientId, CLIENT_VERSION_MISMATCH)
    }

    const subscriptionUp = ({module, username, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag(username, clientId, subscriptionId)} up`)
        servers.sendEvent(module, SUBSCRIPTION_UP, {username, clientId, subscriptionId})
    }
    
    const subscriptionDown = ({module, username, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag(username, clientId, subscriptionId)} down`)
        servers.sendEvent(module, SUBSCRIPTION_DOWN, {username, clientId, subscriptionId})
    }
    
    const googleAccesstokenAdded = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token added`)
        servers.broadcastEvent(GOOGLE_ACCESS_TOKEN_ADDED, {user})
        clients.sendEventToUser(user.username, GOOGLE_ACCESS_TOKEN_ADDED)
    }
    
    const googleAccesstokenUpdated = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token updated`)
        servers.broadcastEvent(GOOGLE_ACCESS_TOKEN_UPDATED, {user})
        clients.sendEventToUser(user.username, GOOGLE_ACCESS_TOKEN_UPDATED)
    }
    
    const googleAccesstokenRemoved = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token removed`)
        servers.broadcastEvent(GOOGLE_ACCESS_TOKEN_REMOVED, {user})
        clients.sendEventToUser(user.username, GOOGLE_ACCESS_TOKEN_REMOVED)
    }

    const handleEvent = (type, data) => {
        switch (type) {
            case MODULE_UP:
                return moduleUp(data)
            case MODULE_DOWN:
                return moduleDown(data)
            case USER_UP:
                return userUp(data)
            case USER_DOWN:
                return userDown(data)
            case USER_UPDATED:
                return userUpdated(data)
            case CLIENT_UP:
                return clientUp(data)
            case CLIENT_DOWN:
                return clientDown(data)
            case CLIENT_VERSION_MISMATCH:
                return clientVersionMismatch(data)
            case SUBSCRIPTION_UP:
                return subscriptionUp(data)
            case SUBSCRIPTION_DOWN:
                return subscriptionDown(data)
            case GOOGLE_ACCESS_TOKEN_ADDED:
                return googleAccesstokenAdded(data)
            case GOOGLE_ACCESS_TOKEN_UPDATED:
                return googleAccesstokenUpdated(data)
            case GOOGLE_ACCESS_TOKEN_REMOVED:
                return googleAccesstokenRemoved(data)
            default:
                log.warn(`Unkown event type ${type}`)
        }
    }

    event$.subscribe({
        next: ({type, data}) => handleEvent(type, data),
        error: error => log.fatal('Unexpected event$ stream error', error),
        complete: () => log.fatal('Unexpected event$ stream closed')
    })
}

module.exports = {
    initializeEvents
}
