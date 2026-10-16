import assert from 'node:assert/strict'
import {afterEach, describe, mock, test} from 'node:test'

import {callsOf, inSequence} from '#sepal/testSupport/mock'

import {refreshGoogleTokens} from './command/refreshGoogleTokens.js'
import {createGoogleOAuthGateway} from './googleOAuthGateway.js'
import {State} from './workerSession.js'

describe('createGoogleOAuthGateway.refreshTokens', () => {
    afterEach(() => {
        mock.restoreAll()
    })

    test('POSTs JSON to <endpoint>refresh-access-token with an admin sepal-user header', async () => {
        const fetchMock = mock.fn(async () => ({
            ok: true,
            text: async () => ''
        }))
        global.fetch = fetchMock
        const gateway = createGoogleOAuthGateway({googleOAuthEndpoint: 'http://user/google/'})

        await gateway.refreshTokens('alice')

        assert.equal(fetchMock.mock.callCount(), 1)
        const [url, init] = fetchMock.mock.calls[0].arguments
        assert.equal(url, 'http://user/google/refresh-access-token')
        assert.equal(init.method, 'POST')
        assert.match(init.headers['Content-Type'], /application\/json/)
        assert.deepEqual(JSON.parse(init.headers['sepal-user']), {
            username: 'alice',
            roles: ['application_admin'],
        })
    })

    test('falls back to the default user-module endpoint when config omits it', async () => {
        const fetchMock = mock.fn(async () => ({
            ok: true,
            text: async () => ''
        }))
        global.fetch = fetchMock
        const gateway = createGoogleOAuthGateway({})
        await gateway.refreshTokens('bob')
        assert.equal(
            fetchMock.mock.calls[0].arguments[0],
            'http://user/google/refresh-access-token'
        )
    })

    test('throws on a non-2xx response', async () => {
        global.fetch = mock.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => 'boom'
        }))
        const gateway = createGoogleOAuthGateway({googleOAuthEndpoint: 'http://user/google/'})
        await assert.rejects(gateway.refreshTokens('carol'), /carol.*500/)
    })
})

describe('refreshGoogleTokens command', () => {
    test('dedupes usernames — refreshes once per user across PENDING+ACTIVE sessions', async () => {
        const repo = {
            sessions: mock.fn(async () => [
                {username: 'alice'},
                {username: 'bob'},
                {username: 'alice'},
            ]),
        }
        const refreshTokens = mock.fn(async () => undefined)
        await refreshGoogleTokens({repo, googleOAuthGateway: {refreshTokens}})

        assert.deepEqual(callsOf(repo.sessions), [[[State.PENDING, State.ACTIVE]]])
        assert.equal(refreshTokens.mock.callCount(), 2)
        assert.deepEqual(callsOf(refreshTokens).map(c => c[0]).sort(), ['alice', 'bob'])
    })

    test('per-user isolation — one failure does not abort the rest', async () => {
        const repo = {
            sessions: mock.fn(async () => [{username: 'alice'}, {username: 'bob'}]),
        }
        const refreshTokens = mock.fn(inSequence([async () => {
            throw new Error('alice failed')
        }, async () => undefined]))
        assert.equal(
            await refreshGoogleTokens({repo, googleOAuthGateway: {refreshTokens}}),
            null
        )
        assert.equal(refreshTokens.mock.callCount(), 2)
    })
})
