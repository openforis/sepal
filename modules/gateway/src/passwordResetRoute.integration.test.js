import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, before, beforeEach, describe, mock, test} from 'node:test'

import express from 'express'

// A password reset over real HTTP, posted as the GUI posts it, to a stand-in for the user module that accepts
// `VALID_TOKEN`, for the user `BOB`.

const VALID_TOKEN = 'valid-token'
const BOB = {username: 'bob', status: 'ACTIVE', roles: []}

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {default: {user: upstream.address}}
})

const {passwordResetRoute} = await import('./passwordResetRoute.js')

describe('a password reset', () => {
    let gateway
    let sessionsStarted

    before(async () => {
        gateway = await startGateway(user => sessionsStarted.push(user))
    })

    beforeEach(() => {
        sessionsStarted = []
        upstream.resetsReceived.length = 0
    })

    after(async () => {
        await gateway.close()
        await upstream.close()
    })

    test('logs the browser in as the account it reset', async () => {
        const response = await gateway.reset({token: VALID_TOKEN, password: 'new-password', recaptchaToken: 'r'})

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, BOB)
        assert.deepEqual(sessionsStarted, [BOB])
    })

    test('passes the reset on to the user module as it was submitted', async () => {
        const reset = {token: VALID_TOKEN, password: 'new-password', recaptchaToken: 'r'}

        await gateway.reset(reset)

        assert.deepEqual(upstream.resetsReceived, [reset])
    })

    test('logs nobody in when the user module refuses it', async () => {
        const response = await gateway.reset({token: 'expired-token', password: 'new-password', recaptchaToken: 'r'})

        assert.equal(response.status, 400)
        assert.deepEqual(response.body, {message: 'Invalid token'})
        assert.deepEqual(sessionsStarted, [])
    })
})

const startGateway = async startSession => {
    const app = express()
    app.post('/api/user/password/reset', passwordResetRoute(async (_req, _res, user) => startSession(user)))
    const server = await listen(app)
    const url = `http://127.0.0.1:${server.address().port}/api/user/password/reset`
    return {
        reset: async fields => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'},
                body: new URLSearchParams(fields)
            })
            return {status: response.status, body: await response.json()}
        },
        close: () => new Promise(resolve => server.close(resolve))
    }
}

async function startUpstream() {
    const resetsReceived = []
    const app = express()
    app.use(express.urlencoded({extended: false}))
    app.post('/password/reset', (req, res) => {
        resetsReceived.push({...req.body})
        req.body.token === VALID_TOKEN
            ? res.json(BOB)
            : res.status(400).json({message: 'Invalid token'})
    })
    const server = await listen(app)
    return {
        address: `127.0.0.1:${server.address().port}`,
        resetsReceived,
        close: () => new Promise(resolve => server.close(resolve))
    }
}
