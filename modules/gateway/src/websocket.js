const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')

const initializeWebSocketServer = wss => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink(servers, clients)
    initializeDownlink(servers, clients, wss)
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}),
    onHeartBeat: ({hb}) => ({hb}),
    messageFromClient: {user, clientId, online},
    messageFromClient: {user, clientId, subscriptionId, data},
    messageToClient: {clientId, subscriptionId, data}
})

const CLIENT_CONTRACT = () => ({
    onHeartBeat: ({hb}) => ({hb}),
    messageFromServer: {modules: {state: ['foo', 'bar']}},
    messageFromServer: {modules: {update: {foo: false, baz: true}}},
    messageFromServer: {subscriptionId, data},
    messageToServer: {module, subscriptionId, online},
    messageToServer: {module, subscriptionId, data}
})
