const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')

const initializeWebSocketServer = ({wss, userStore, onUserConnected, onUserDisconnected}) => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink({servers, clients, userStore})
    initializeDownlink({servers, clients, wss, onUserConnected, onUserDisconnected})
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    onUserUp: {event: 'userUp', user},
    onUserDown: {event: 'userDown', user},
    onUserUpdate: {event: 'userUpdate', user},
    onClientUp: {event: 'clientUp', user, clientId},
    onClientDown: {event: 'clientDown', user, clientId},
    onSubscriptionUp: {event: 'subscriptionUp', user, clientId, subscriptionId},
    onSubscriptionDown: {event: 'subscriptionDown', user, clientId, subscriptionId},
    onUserUpdate: {user},
    onClientMessage: {user, clientId, subscriptionId, data},
    out: {clientId, subscriptionId, data}
})

const CLIENT_CONTRACT = () => ({
    onHeartBeat: ({hb}) => ({hb}),
    onModuleState: {modules: {state: ['foo', 'bar']}},
    onModuleStateUpdate: {modules: {update: {foo: false, baz: true}}},
    onServerData: {subscriptionId, data},
    out: {module, subscriptionId, online},
    out: {module, subscriptionId, data}
})
