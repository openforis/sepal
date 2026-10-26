import assert from 'node:assert/strict'
import {afterEach, describe, mock, test} from 'node:test'

import {assertMatches} from '#sepal/testSupport/assert'

import {createUserPublicKeyClient} from './userPublicKeyClient.js'

describe('createUserPublicKeyClient.publicKey', () => {
    afterEach(() => {
        mock.restoreAll()
    })

    test('GETs the user\'s key from the user module as an admin and returns it', async () => {
        global.fetch = mock.fn(async () => textResponse(200, PUBLIC_KEY))
        const client = createUserPublicKeyClient({userUrl: 'http://user/', sepalUser: 'sepaladmin'})

        const key = await client.publicKey('alice')

        assert.equal(key, PUBLIC_KEY)
        const [url, init] = global.fetch.mock.calls[0].arguments
        assert.equal(url, 'http://user/sandbox-public-key?username=alice')
        assertMatches(JSON.parse(init.headers['sepal-user']), {username: 'sepaladmin', roles: ['application_admin']})
    })

    test('throws when the user module has no key for the user', async () => {
        global.fetch = mock.fn(async () => textResponse(404, '{"message":"SSH public key not found"}'))

        await assert.rejects(createUserPublicKeyClient({}).publicKey('alice'), /alice: 404/)
    })
})

const PUBLIC_KEY = 'ssh-rsa AAAAB3NzaC1yc2E Sandbox key for alice'

const textResponse = (status, text) => ({ok: status < 300, status, text: async () => text})
