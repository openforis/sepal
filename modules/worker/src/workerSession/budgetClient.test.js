// Tests for the budget client. fetch is mocked — the budget module is never contacted.

import {jest} from '@jest/globals'

import {createBudgetClient} from './budgetClient.js'

describe('createBudgetClient.check', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    const okResponse = verdict => ({ok: true, status: 200, json: async () => verdict})

    test('GETs <budgetUrl>/budget/check/<username> with an admin sepal-user header', async () => {
        const fetchMock = jest.fn().mockResolvedValue(okResponse({username: 'alice', exceeded: false, reason: null}))
        global.fetch = fetchMock
        const client = createBudgetClient({budgetUrl: 'http://budget', sepalUser: 'sepalAdmin'})

        await client.check('alice')

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('http://budget/budget/check/alice')
        expect(JSON.parse(init.headers['sepal-user'])).toMatchObject({
            username: 'sepalAdmin',
            roles: ['application_admin'],
        })
    })

    test('falls back to the default budget URL and admin user when config omits them', async () => {
        global.fetch = jest.fn().mockResolvedValue(okResponse({exceeded: false, reason: null}))
        await createBudgetClient({}).check('bob')
        expect(global.fetch.mock.calls[0][0]).toBe('http://budget/budget/check/bob')
        expect(JSON.parse(global.fetch.mock.calls[0][1].headers['sepal-user']).username).toBe('sepalAdmin')
    })

    test('strips a trailing slash from the configured URL so the path never doubles up', async () => {
        global.fetch = jest.fn().mockResolvedValue(okResponse({exceeded: false, reason: null}))
        await createBudgetClient({budgetUrl: 'http://budget///'}).check('bob')
        expect(global.fetch.mock.calls[0][0]).toBe('http://budget/budget/check/bob')
    })

    test('URL-encodes the username', async () => {
        global.fetch = jest.fn().mockResolvedValue(okResponse({exceeded: false, reason: null}))
        await createBudgetClient({}).check('a b/c')
        expect(global.fetch.mock.calls[0][0]).toBe('http://budget/budget/check/a%20b%2Fc')
    })

    test('returns the normalised verdict', async () => {
        global.fetch = jest.fn().mockResolvedValue(
            okResponse({username: 'carol', exceeded: true, reason: 'STORAGE_QUOTA'})
        )
        await expect(createBudgetClient({}).check('carol'))
            .resolves.toEqual({exceeded: true, reason: 'STORAGE_QUOTA'})
    })

    test('only an explicit `true` counts as exceeded — a malformed body must not lock a user out', async () => {
        global.fetch = jest.fn().mockResolvedValue(okResponse({exceeded: 'yes'}))
        await expect(createBudgetClient({}).check('dave'))
            .resolves.toEqual({exceeded: false, reason: null})
    })

    test('throws on a non-2xx response, so the caller can fall back', async () => {
        global.fetch = jest.fn().mockResolvedValue({ok: false, status: 503, text: async () => 'down'})
        await expect(createBudgetClient({}).check('erin')).rejects.toThrow(/erin.*503/)
    })

    test('propagates a transport failure, so the caller can fall back', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
        await expect(createBudgetClient({}).check('frank')).rejects.toThrow('ECONNREFUSED')
    })
})
