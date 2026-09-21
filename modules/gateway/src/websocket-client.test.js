import {WebSocket} from 'ws'

import {Clients} from './websocket-client.js'

// A browser tab is kicked by the login session it authenticated with: the tab receives the event
// and its socket is closed once that message has left, so the tab can act on it before the close.

describe('sendEventToSession', () => {
    test('reaches only the clients of that session', () => {
        const clients = Clients()
        const [a1, a2, b] = [aSocket(), aSocket(), aSocket()]
        clients.add('alice', 'c1', a1, 's1')
        clients.add('alice', 'c2', a2, 's1')
        clients.add('bob', 'c3', b, 's2')

        clients.sendEventToSession('s1', 'loginSessionInvalidated', {sessionId: 's1'})

        expect(a1.sent).toEqual([{event: {type: 'loginSessionInvalidated', data: {sessionId: 's1'}}}])
        expect(a2.sent).toEqual([{event: {type: 'loginSessionInvalidated', data: {sessionId: 's1'}}}])
        expect(b.sent).toEqual([])
    })

    test('closes the socket after the event has been sent', () => {
        const clients = Clients()
        const socket = aSocket()
        clients.add('alice', 'c1', socket, 's1')

        clients.sendEventToSession('s1', 'loginSessionInvalidated', {sessionId: 's1'})

        expect(socket.closed).toBe(false)
        socket.flush()
        expect(socket.closed).toBe(true)
    })
})

const aSocket = () => {
    const pending = []
    const socket = {
        readyState: WebSocket.OPEN,
        sent: [],
        closed: false,
        send: (message, callback) => {
            socket.sent.push(JSON.parse(message))
            callback && pending.push(callback)
        },
        close: () => socket.closed = true,
        flush: () => pending.splice(0).forEach(callback => callback())
    }
    return socket
}
