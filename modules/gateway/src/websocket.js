const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')

const initializeWebSocketServer = ({wss, onUserConnected, onUserDisconnected}) => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink({servers, clients})
    initializeDownlink({servers, clients, wss, onUserConnected, onUserDisconnected})
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    in: {user, update},
    in: {user, clientId, online},
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
