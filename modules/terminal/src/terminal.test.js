import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, before, describe, test} from 'node:test'

let homeDir
let Session
let Terminal

before(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'terminal-'))
    process.env.IP = '127.0.0.1'
    process.env.HOME_DIR = homeDir
    process.env.SSH_SCRIPT_PATH = join(homeDir, 'ssh-script')
    await writeFile(process.env.SSH_SCRIPT_PATH, '#!/bin/sh\nexec cat\n')
    await chmod(process.env.SSH_SCRIPT_PATH, 0o755)
    Session = await import('./session.js')
    Terminal = await import('./terminal.js')
})

after(() => rm(homeDir, {recursive: true, force: true}))

describe('start', () => {
    test('refuses to attach a user to another user\'s session', t => {
        const ownerSocket = aWebsocket()
        Terminal.start(ownerSocket, aStartRequest({sessionId: 'shared-id', username: 'alice'}))
        t.after(() => ownerSocket.emit('close'))
        const intruderSocket = aWebsocket()

        Terminal.start(intruderSocket, aStartRequest({sessionId: 'shared-id', username: 'mallory'}))

        assert.equal(intruderSocket.closed, true)
        assert.equal(Session.find(aResizeRequest({sessionId: 'shared-id', username: 'alice'}))?.username, 'alice')
    })
})

describe('resize', () => {
    test('rejects a session that was never started, without creating it', () => {
        const req = aResizeRequest({sessionId: 'unknown-session'})
        const res = aResponse()

        Terminal.resize(req, res)

        assert.equal(res.statusCode, 404)
        assert.equal(Session.find(req), undefined)
    })

    test('rejects another user\'s session', t => {
        const ownerSocket = aWebsocket()
        Terminal.start(ownerSocket, aStartRequest({sessionId: 'alice-session', username: 'alice'}))
        t.after(() => ownerSocket.emit('close'))
        const res = aResponse()

        Terminal.resize(aResizeRequest({sessionId: 'alice-session', username: 'mallory'}), res)

        assert.equal(res.statusCode, 404)
    })

    test('resizes the requester\'s own session', t => {
        const ownerSocket = aWebsocket()
        Terminal.start(ownerSocket, aStartRequest({sessionId: 'own-session', username: 'alice'}))
        t.after(() => ownerSocket.emit('close'))
        const res = aResponse()

        Terminal.resize(aResizeRequest({sessionId: 'own-session', username: 'alice'}), res)

        assert.equal(res.statusCode, 200)
    })
})

const aStartRequest = ({sessionId, username = 'alice'}) => ({
    params: {sessionId},
    query: {cols: '80', rows: '24'},
    headers: {'sepal-user': JSON.stringify({username})}
})

const aResizeRequest = ({sessionId, username = 'alice'}) => ({
    params: {sessionId},
    query: {cols: '120', rows: '40'},
    headers: {'sepal-user': JSON.stringify({username})}
})

const aWebsocket = () => {
    const websocket = new EventEmitter()
    websocket.closed = false
    websocket.send = () => {}
    websocket.close = () => {
        websocket.closed = true
    }
    return websocket
}

const aResponse = () => {
    const res = {
        statusCode: null,
        status: code => {
            res.statusCode = code
            return res
        },
        end: () => res
    }
    return res
}
