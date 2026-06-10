const {initializeDownlink} = require('./websocket-downlink')
const {initializeUplink} = require('./websocket-uplink')
const {Servers} = require('./websocket-server')
const {Clients} = require('./websocket-client')
const {initializeEvents} = require('./websocket-events')
const {USER_UP, USER_DOWN, USER_UPDATED, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN} = require('#sepal/event/definitions')

const initializeWebSocketServer = ({wss, userStore, event$}) => {
    const servers = Servers()
    const clients = Clients()

    initializeUplink({servers, clients, event$})
    initializeDownlink({servers, clients, wss, userStore, event$})
    initializeEvents({servers, clients, userStore, event$})
}

module.exports = {initializeWebSocketServer}

/* eslint-disable */

// *********************************
// Description of websocket protocol 
// *********************************

// module <- MODULE PROTOCOL -> gateway <- INTERNAL PROTOCOL -> client <- SUBSCRIPTION PROTOCOL -> subscriber

const USER = new Object
const USERNAME = new String
const CLIENT_ID = new String
const HEARTBEAT = new Number
const BUILD_NUMBER = new String
const MODULE_NAME = new String
const MODULE_STATE = new Boolean
const SUBSCRIPTION_ID = new String
const SUBSCRIPTION_STATE = new Boolean
const READY_STATE = new Boolean
const EVENT_TYPE = new String
const DATA = new Object

// module <-> gateway: implemented by backend modules

const MODULE_PROTOCOL = () => ({
    rx: [
        // heartbeat request
        {hb: HEARTBEAT},
        // user up
        {event: USER_UP, user: USER},
        // user down
        {event: USER_DOWN, user: USER},
        // user updated
        {event: USER_UPDATED, user: USER},
        // client up
        {event: CLIENT_UP, user: USER, clientId: CLIENT_ID},
        // client down
        {event: CLIENT_DOWN, user: USER, clientId: CLIENT_ID},
        // subscription up
        {event: SUBSCRIPTION_UP, user: USER, clientId: CLIENT_ID, subscriptionId: SUBSCRIPTION_ID},
        // subscription down
        {event: SUBSCRIPTION_DOWN, user: USER, clientId: CLIENT_ID, subscriptionId: SUBSCRIPTION_ID},
        // message from client
        {user: USER, clientId: CLIENT_ID, subscriptionId: SUBSCRIPTION_ID, data: DATA},
    ],
    tx: [
        // heartbeat echo response
        {hb: HEARTBEAT},
        // server ready
        {ready: true},
        // multicast message to all clients of a specific user
        {username: USERNAME, data: DATA},
        // multicast message to all clients of a specific user except a specific client
        {username: USERNAME, excludeClientId: CLIENT_ID, data: DATA},
        // unicast message to specific client
        {clientId: CLIENT_ID, subscriptionId: SUBSCRIPTION_ID, data: DATA},
    ]
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
