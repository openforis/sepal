const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')
const {USER_UP, USER_DOWN, USER_UPDATED, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN, initializeEvents} = require('./websocket-events')

const initializeWebSocketServer = ({wss, userStore, event$, userUp$, userDown$}) => {
    const servers = Servers()
    const clients = Clients()

    initializeUplink({servers, clients, event$})
    initializeDownlink({servers, clients, wss, userStore, event$})
    initializeEvents({servers, clients, userStore, event$, userUp$, userDown$})
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    onUserUp: {event: USER_UP, user},
    onUserDown: {event: USER_DOWN, user},
    onUserUpdate: {event: USER_UPDATED, user},
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
