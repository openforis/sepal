import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {existsSync} from 'node:fs'
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
    await writeFile(process.env.SSH_SCRIPT_PATH, '#!/bin/sh\nprintf "TERM=%s\\n" "$TERM"\nexec cat\n')
    await chmod(process.env.SSH_SCRIPT_PATH, 0o755)
    Session = await import('./session.js')
    Terminal = await import('./terminal.js')
})

after(() => rm(homeDir, {recursive: true, force: true}))

describe('start', () => {
    test('cleans up a failed socket while another terminal keeps working', {timeout: 5000}, async t => {
        const failedSocket = aWebsocket()
        const healthySocket = aWebsocket()
        const failedRequest = aStartRequest({sessionId: 'failed-socket'})
        const healthyRequest = aStartRequest({sessionId: 'healthy-socket', username: 'bob'})
        t.after(() => {
            if (!failedSocket.closed) failedSocket.emit('close')
            healthySocket.emit('close')
        })
        Terminal.start(failedSocket, failedRequest)
        Terminal.start(healthySocket, healthyRequest)
        const {tempKeyFile} = Session.find(failedRequest)
        await writeFile(tempKeyFile, 'temporary test key')
        const output = new Promise(resolve => {
            let received = ''
            healthySocket.send = data => {
                received += data
                if (received.includes('still working')) resolve()
            }
        })

        failedSocket.emit('error', new Error('Invalid WebSocket frame'))
        healthySocket.emit('message', 'still working\n')

        assert.equal(failedSocket.closed, true)
        assert.equal(Session.find(failedRequest), undefined)
        assert.equal(existsSync(tempKeyFile), false)
        assert.equal(healthySocket.closed, false)
        assert.equal(Session.find(healthyRequest)?.username, 'bob')
        await output
    })

    test('rejects unsafe session IDs before creating a terminal', () => {
        for (const sessionId of [
            'session -oProxyCommand=unused', '../outside', 'a/b', 'a\\b', 'a b', 'a\tb',
            'a\nb', 'trailing\n', '*', '$HOME', ';unused', '', null, undefined, 42, ['valid-id'],
            'a'.repeat(129)
        ]) {
            let session
            try {
                assert.throws(() => {
                    session = Session.get(aStartRequest({sessionId}))
                }, /Invalid terminal session ID/, JSON.stringify(sessionId))
            } finally {
                if (session) {
                    session.terminal.kill()
                    Session.remove(sessionId)
                }
            }
        }
    })

    for (const sessionId of ['dba967c1-5450-4800-9c1b-b8990c52ff17', 'constructor', '__proto__']) {
        test(`accepts the safe session ID ${sessionId}`, t => {
            const websocket = aWebsocket()
            Terminal.start(websocket, aStartRequest({sessionId}))
            t.after(() => websocket.emit('close'))

            assert.equal(websocket.closed, false)
            assert.equal(Session.find(aResizeRequest({sessionId}))?.id, sessionId)
        })
    }

    test('advertises modern xterm capabilities to the SSH process', {timeout: 5000}, async t => {
        const websocket = aWebsocket()
        const output = new Promise(resolve => {
            let received = ''
            websocket.send = data => {
                received += data
                if (received.includes('\n')) {
                    resolve(received)
                }
            }
        })

        Terminal.start(websocket, aStartRequest({sessionId: 'terminal-capabilities'}))
        t.after(() => websocket.emit('close'))

        assert.match(await output, /TERM=xterm-256color\r?\n/)
    })

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
    websocket.terminate = () => {
        websocket.closed = true
        websocket.emit('close')
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
