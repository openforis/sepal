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
    in: {event: 'userUp', user},
    in: {event: 'userDown', user},
    in: {event: 'clientUp', user, clientId},
    in: {event: 'clientDown', user, clientId},
    in: {event: 'subscriptionUp', user, clientId, subscriptionId},
    in: {event: 'subscriptionDown', user, clientId, subscriptionId},
    in: {user, clientId, subscriptionId, data},
    out: {clientId, subscriptionId, data}
})

const CLIENT_CONTRACT = () => ({
    onHeartBeat: ({hb}) => ({hb}),
    in: {modules: {state: ['foo', 'bar']}},
    in: {modules: {update: {foo: false, baz: true}}},
    in: {subscriptionId, data},
    out: {module, subscriptionId, online},
    out: {module, subscriptionId, data}
})
