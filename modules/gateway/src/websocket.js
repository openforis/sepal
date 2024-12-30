const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')
const {USER_UP, USER_DOWN, USER_UPDATE, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN} = require('./websocket-events')

const initializeWebSocketServer = ({wss, userStore, userStatus$, toUser$}) => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink({servers, clients, userStore})
    initializeDownlink({servers, clients, wss, userStatus$, toUser$})
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    onUserUp: {event: USER_UP, user},
    onUserDown: {event: USER_DOWN, user},
    onUserUpdate: {event: USER_UPDATE, user},
    onClientUp: {event: CLIENT_UP, user, clientId},
    onClientDown: {event: CLIENT_DOWN, user, clientId},
    onSubscriptionUp: {event: SUBSCRIPTION_UP, user, clientId, subscriptionId},
    onSubscriptionDown: {event: SUBSCRIPTION_DOWN, user, clientId, subscriptionId},
    onUserUpdate: {user},
    onClientMessage: {user, clientId, subscriptionId, data},
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
