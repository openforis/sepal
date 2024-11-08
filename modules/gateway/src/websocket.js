const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')

const initializeWebSocketServer = wss => {
    const servers = Servers()
    const clients = Clients()
    
    initializeUplink(wss, servers, clients)
    initializeDownlink(wss, servers, clients)
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

const PROTOCOL_DEFINITION = () => ({
    toModule: {
        clientConnected: {user, online: true},
        clientDisconnected: {user, online: false},
        clientCredentialsUpdated: {user, update: true}, // to be implemented
        clientData: {user, data},
        // heartbeatRequest: {hb: millis}
    },
    fromModule: {
        serverReady: {ready: true}, // response to websocket connection
        moduleData: {username, data}, // to client
        // heartbeatResponse: {hb: millis} // response to serverHeartbeat
    },
    fromClient: {
        clientData: {module, data}, // to module
        // heartbeatResponse: {hb: millis}
    },
    toClient: {
        moduleStatus: {
            foo: true,
            bar: true,
            baz: false
        },
        moduleData: {module, data}, // from module
        // heartbeatRequest: {hb: millis} // response to client heartbeat
    }
})

const SERVER_CONTRACT = () => ({
    onConnect: () => ({ready: true}), // gateway to broadcase to all clients
    // onHeartBeat: ({hb}) => ({hb}), // echo heartbeat
    messageFromClient: {user, data},
    messageToClient: {username, data}
})

const CLIENT_CONTRACT = () => ({
    // onHeartBeat: ({hb}) => ({hb}), // echo heartbeat
    messageFromServer: {modules: {status: ['foo', 'bar', 'baz']}},
    messageFromServer: {modules: {update: {foo: false}}},
    messageFromServer: {module, data},
    messageToServer: {module, data}
})
