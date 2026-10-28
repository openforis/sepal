import assert from 'node:assert/strict'
import {afterEach, describe, mock, test} from 'node:test'

import {assertMatches} from '#sepal/testSupport/assert'

import {createBudgetClient} from './budgetClient.js'

describe('createBudgetClient.check', () => {
    afterEach(() => {
        mock.restoreAll()
    })

    const okResponse = verdict => ({ok: true, status: 200, json: async () => verdict})

    test('POSTs <budgetUrl>/budget/check/<username> with an admin sepal-user header', async () => {
        const fetchMock = mock.fn(async () => okResponse({username: 'alice', exceeded: false, reason: null}))
        global.fetch = fetchMock
        const client = createBudgetClient({budgetUrl: 'http://budget', sepalUser: 'sepaladmin'})

        await client.check('alice')

        assert.equal(fetchMock.mock.callCount(), 1)
        const [url, init] = fetchMock.mock.calls[0].arguments
        assert.equal(url, 'http://budget/budget/check/alice')
        assert.equal(init.method, 'POST')
        assertMatches(JSON.parse(init.headers['sepal-user']), {
            username: 'sepaladmin',
            roles: ['application_admin'],
        })
    })

    test('sends the open sessions as JSON, creation times in ISO-8601', async () => {
        global.fetch = mock.fn(async () => okResponse({exceeded: false, reason: null}))
        const openSession = {sessionId: 's-1', instanceType: 'T3aSmall', creationTime: new Date('2026-01-01T12:00:00Z')}

        await createBudgetClient({}).check('alice', [openSession])

        const init = global.fetch.mock.calls[0].arguments[1]
        assert.equal(init.headers['Content-Type'], 'application/json')
        assert.deepEqual(JSON.parse(init.body), {
            openSessions: [{sessionId: 's-1', instanceType: 'T3aSmall', creationTime: '2026-01-01T12:00:00.000Z'}],
        })
    })

    test('falls back to the default budget URL and admin user when config omits them', async () => {
        global.fetch = mock.fn(async () => okResponse({exceeded: false, reason: null}))
        await createBudgetClient({}).check('bob')
        assert.equal(global.fetch.mock.calls[0].arguments[0], 'http://budget/budget/check/bob')
        assert.equal(
            JSON.parse(global.fetch.mock.calls[0].arguments[1].headers['sepal-user']).username,
            'sepaladmin'
        )
    })

    test('strips a trailing slash from the configured URL so the path never doubles up', async () => {
        global.fetch = mock.fn(async () => okResponse({exceeded: false, reason: null}))
        await createBudgetClient({budgetUrl: 'http://budget///'}).check('bob')
        assert.equal(global.fetch.mock.calls[0].arguments[0], 'http://budget/budget/check/bob')
    })

    test('URL-encodes the username', async () => {
        global.fetch = mock.fn(async () => okResponse({exceeded: false, reason: null}))
        await createBudgetClient({}).check('a b/c')
        assert.equal(
            global.fetch.mock.calls[0].arguments[0],
            'http://budget/budget/check/a%20b%2Fc'
        )
    })

    test('returns the normalised verdict', async () => {
        global.fetch = mock.fn(
            async () => okResponse({username: 'carol', exceeded: true, reason: 'STORAGE_QUOTA'})
        )
        assert.deepEqual(
            await createBudgetClient({}).check('carol'),
            {exceeded: true, reason: 'STORAGE_QUOTA'}
        )
    })

    test('only an explicit `true` counts as exceeded — a malformed body must not lock a user out', async () => {
        global.fetch = mock.fn(async () => okResponse({exceeded: 'yes'}))
        assert.deepEqual(
            await createBudgetClient({}).check('dave'),
            {exceeded: false, reason: null}
        )
    })

    test('throws on a non-2xx response, so the caller can fall back', async () => {
        global.fetch = mock.fn(async () => ({
            ok: false,
            status: 503,
            text: async () => 'down'
        }))
        await assert.rejects(createBudgetClient({}).check('erin'), /erin.*503/)
    })

    test('propagates a transport failure, so the caller can fall back', async () => {
        global.fetch = mock.fn(async () => {
            throw new Error('ECONNREFUSED')
        })
        await assert.rejects(createBudgetClient({}).check('frank'), /ECONNREFUSED/)
    })
})
