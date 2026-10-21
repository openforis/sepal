import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {afterEach, describe, test} from 'node:test'

import {of, Subject} from 'rxjs'
import {WebSocket} from 'ws'

import {USER_DOWN, USER_UP} from '#sepal/event/definitions'

import {Clients} from './websocket-client.js'
import {initializeDownlink} from './websocket-downlink.js'

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

const openSockets = []

afterEach(() => openSockets.splice(0).forEach(socket => socket.emit('close')))

const aDownlink = () => {
    const wss = new EventEmitter()
    const event$ = new Subject()
    const events = []
    event$.subscribe(({type}) => events.push(type))
    initializeDownlink({
        servers: {list: () => []},
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
    return {connect, userEvents}
}

// Like ws: terminate() emits 'close' asynchronously.
const aSocket = () => {
    const socket = new EventEmitter()
    socket.readyState = WebSocket.OPEN
    socket.send = () => null
    socket.terminate = () => setImmediate(() => socket.emit('close'))
    return socket
}

const closed = () => new Promise(resolve => setImmediate(resolve))
