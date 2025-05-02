const _ = require('lodash')
const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')
const {USER_UP, USER_DOWN, USER_UPDATE, GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_UPDATED, GOOGLE_ACCESS_TOKEN_REMOVED, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN} = require('./websocket-events')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('websocket')

const initializeWebSocketServer = ({wss, userStore, userStatus$, toUser$}) => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink({servers, clients, userStore})
    initializeDownlink({servers, clients, wss, userStore, userStatus$, toUser$})

    const sendEvent = (event, user) => {
        userStatus$.next({event, user})
        servers.broadcast({event, user})
        toUser$.next({username: user.username, event: {[event]: user}})
    }

    userStore.userUpdate$.subscribe({
        next: ({prevUser, user}) => {
            log.debug(`${userTag(user.username)} updated`)
            if (!_.isEqual(prevUser, user)) {
                sendEvent(USER_UPDATE, user)
                if (!prevUser.googleTokens && user.googleTokens) {
                    sendEvent(GOOGLE_ACCESS_TOKEN_ADDED, user)
                } else if (prevUser.googleTokens && !user.googleTokens) {
                    sendEvent(GOOGLE_ACCESS_TOKEN_REMOVED, user)
                } else if (!_.isEqual(prevUser.googleTokens, user.googleTokens)) {
                    sendEvent(GOOGLE_ACCESS_TOKEN_UPDATED, user)
                }
            }
        },
        error: error => log.error('Unexpected userUpdate$ error', error),
        complete: () => log.error('Unexpected userUpdate$ complete')
    })
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    onUserUp: {event: USER_UP, user},
    onUserDown: {event: USER_DOWN, user},
    onUserUpdate: {event: USER_UPDATE, user},
    onClientUp: {event: CLIENT_UP, username, clientId},
    onClientDown: {event: CLIENT_DOWN, username, clientId},
    onSubscriptionUp: {event: SUBSCRIPTION_UP, username, clientId, subscriptionId},
    onSubscriptionDown: {event: SUBSCRIPTION_DOWN, username, clientId, subscriptionId},
    onClientMessage: {username, clientId, subscriptionId, data},
    out: {username, data},
    out: {clientId, subscriptionId, data}
})

const CLIENT_CONTRACT = () => ({
    onHeartBeat: ({hb}) => ({hb}),
    onEvent: ({event}) => ({event}),
    onModuleState: {modules: {state: ['foo', 'bar']}},
    onModuleStateUpdate: {modules: {update: {foo: false, baz: true}}},
    onServerData: {subscriptionId, data},
    out: {module, subscriptionId, online},
    out: {module, subscriptionId, data}
})

const FROM_USER_EVENT = () => ({
    onUserUp: {event: USER_UP, user},
    onUserDown: {event: USER_DOWN, user}
})
