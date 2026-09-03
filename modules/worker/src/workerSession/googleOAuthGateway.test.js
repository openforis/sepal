// Tests for the Google OAuth gateway + RefreshGoogleTokens command. fetch is mocked — the user
// module is never contacted.

import {jest} from '@jest/globals'

import {refreshGoogleTokens} from './command/refreshGoogleTokens.js'
import {createGoogleOAuthGateway} from './googleOAuthGateway.js'
import {State} from './workerSession.js'

describe('createGoogleOAuthGateway.refreshTokens', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('POSTs JSON to <endpoint>refresh-access-token with an admin sepal-user header', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createGoogleOAuthGateway({googleOAuthEndpoint: 'http://user/google/'})

        await gateway.refreshTokens('alice')

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('http://user/google/refresh-access-token')
        expect(init.method).toBe('POST')
        expect(init.headers['Content-Type']).toMatch(/application\/json/)
        expect(JSON.parse(init.headers['sepal-user'])).toEqual({
            username: 'alice',
            roles: ['application_admin'],
        })
    })

    test('falls back to the default user-module endpoint when config omits it', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ok: true, text: async () => ''})
        global.fetch = fetchMock
        const gateway = createGoogleOAuthGateway({})
        await gateway.refreshTokens('bob')
        expect(fetchMock.mock.calls[0][0]).toBe('http://user/google/refresh-access-token')
    })

    test('throws on a non-2xx response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ok: false, status: 500, text: async () => 'boom'})
        const gateway = createGoogleOAuthGateway({googleOAuthEndpoint: 'http://user/google/'})
        await expect(gateway.refreshTokens('carol')).rejects.toThrow(/carol.*500/)
    })
})

describe('refreshGoogleTokens command', () => {
    test('dedupes usernames — refreshes once per user across PENDING+ACTIVE sessions', async () => {
        const repo = {
            sessions: jest.fn().mockResolvedValue([
                {username: 'alice'},
                {username: 'bob'},
                {username: 'alice'},
            ]),
        }
        const refreshTokens = jest.fn().mockResolvedValue(undefined)
        await refreshGoogleTokens({repo, googleOAuthGateway: {refreshTokens}})

        expect(repo.sessions).toHaveBeenCalledWith([State.PENDING, State.ACTIVE])
        expect(refreshTokens).toHaveBeenCalledTimes(2)
        expect(refreshTokens.mock.calls.map(c => c[0]).sort()).toEqual(['alice', 'bob'])
    })

    test('per-user isolation — one failure does not abort the rest', async () => {
        const repo = {
            sessions: jest.fn().mockResolvedValue([{username: 'alice'}, {username: 'bob'}]),
        }
        const refreshTokens = jest.fn()
            .mockRejectedValueOnce(new Error('alice failed'))
            .mockResolvedValueOnce(undefined)
        await expect(
            refreshGoogleTokens({repo, googleOAuthGateway: {refreshTokens}})
        ).resolves.toBeNull()
        expect(refreshTokens).toHaveBeenCalledTimes(2)
    })
})
