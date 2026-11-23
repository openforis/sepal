import assert from 'node:assert/strict'
import {test} from 'node:test'

import {getRequestUser, setRequestUser} from './user.js'

test('API-key authentication removes admin authority without needing worker or task metadata', () => {
    const owner = {
        id: 1, username: 'alice', status: 'ACTIVE', roles: ['application_admin'],
        admin: true, systemUser: true
    }
    const req = {headers: {}, authenticatedWithApiKey: true}

    setRequestUser(req, owner)

    assert.deepEqual(getRequestUser(req), {...owner, roles: [], admin: false, systemUser: false})
    assert.deepEqual(owner.roles, ['application_admin'])
    assert.equal(owner.admin, true)
    assert.equal(owner.systemUser, true)
})
