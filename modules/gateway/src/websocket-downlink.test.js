import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {of, Subject} from 'rxjs'
import {WebSocket} from 'ws'

import {CLIENT_DOWN, CLIENT_UP, USER_DOWN, USER_UP} from '#sepal/event/definitions'

import {Clients} from './websocket-client.js'
import {initializeDownlink} from './websocket-downlink.js'

test('file commands use the logged-in user and client, ignoring forged routing identities', async () => {
    const {connect, forwarded} = aDownlink()
    const socket = connect('alice')
    const {clientId} = socket.sent.find(message => message.clientId)
    const commands = [{monitor: ['']}, {unmonitor: ['folder']}, {remove: 'folder'}]

    for (const data of commands) {
        socket.emit('message', JSON.stringify({
            module: 'user-files',
            user: {username: 'bob', admin: true},
            username: 'bob',
            clientId: 'bobs-client',
            subscriptionId: 'files',
            data
        }))
    }
    await closed()

    assert.deepEqual(forwarded, commands.map(data => ({
        module: 'user-files',
        message: {user: {username: 'alice'}, clientId, subscriptionId: 'files', data}
    })))
})

describe('user presence', () => {
    test('a user stays online while another tab is open, after one tab\'s socket fails', async () => {
        const {connect, userEvents} = aDownlink()
        const failing = connect('alice')
        connect('alice')

        failing.emit('error', new Error('ECONNRESET'))
        await closed()

        assert.deepEqual(userEvents(), [USER_UP])
    })

    test('a user goes offline once when their last socket fails, and online again on reconnect', async () => {
        const {connect, userEvents} = aDownlink()
        const failing = connect('alice')

        failing.emit('error', new Error('ECONNRESET'))
        await closed()
        connect('alice')

        assert.deepEqual(userEvents(), [USER_UP, USER_DOWN, USER_UP])
    })
})

describe('heartbeat', () => {
    beforeEach(() => mock.timers.enable({apis: ['setInterval', 'setTimeout', 'Date']}))
    afterEach(() => mock.timers.reset())

    test('a client that stops answering heartbeats is disconnected', () => {
        const {connect, clientEvents} = aDownlink()
        const socket = connect('alice')
        mock.timers.tick(HEARTBEAT_INTERVAL_MS)
        answerHeartbeat(socket)

        mock.timers.tick(2 * HEARTBEAT_INTERVAL_MS)

        assert.deepEqual(clientEvents(), [CLIENT_UP, CLIENT_DOWN])
    })

    test('a client that closes with a heartbeat timeout pending is disconnected once', () => {
        const {connect, clientEvents} = aDownlink()
        const socket = connect('alice')
        mock.timers.tick(HEARTBEAT_INTERVAL_MS)
        answerHeartbeat(socket)

        socket.emit('close')
        mock.timers.tick(3 * HEARTBEAT_INTERVAL_MS)

        assert.deepEqual(clientEvents(), [CLIENT_UP, CLIENT_DOWN])
    })
})

const HEARTBEAT_INTERVAL_MS = 10 * 1000

const openSockets = []

afterEach(() => openSockets.splice(0).forEach(socket => socket.emit('close')))

const aDownlink = () => {
    const wss = new EventEmitter()
    const event$ = new Subject()
    const events = []
    const forwarded = []
    event$.subscribe(({type}) => events.push(type))
    initializeDownlink({
        servers: {
            list: () => [],
            send: (module, message) => forwarded.push({module, message})
        },
        clients: Clients(),
        wss,
        userStore: {getUser$: username => of({username})},
        event$
    })
    const connect = username => {
        const socket = aSocket()
        openSockets.push(socket)
        wss.emit('connection', socket, null, username, 'session')
        return socket
    }
    const userEvents = () => events.filter(type => [USER_UP, USER_DOWN].includes(type))
    const clientEvents = () => events.filter(type => [CLIENT_UP, CLIENT_DOWN].includes(type))
    return {connect, userEvents, clientEvents, forwarded}
}

// Like ws: terminate() emits 'close' asynchronously.
const aSocket = () => {
    const socket = new EventEmitter()
    socket.readyState = WebSocket.OPEN
    socket.sent = []
    socket.send = message => socket.sent.push(JSON.parse(message))
    socket.terminate = () => setImmediate(() => socket.emit('close'))
    return socket
}

const answerHeartbeat = socket => socket.emit('message', JSON.stringify({hb: Date.now()}))

const closed = () => new Promise(resolve => setImmediate(resolve))
