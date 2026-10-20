import assert from 'node:assert/strict'
import {test} from 'node:test'

import {parseCurrentUser} from './currentUser.js'

test('parses a valid sepal-user header', () => {
    const ctx = {headers: {'sepal-user': JSON.stringify({username: 'bob', roles: []})}}
    assert.deepEqual(parseCurrentUser(ctx), {username: 'bob', roles: []})
})

test('returns null when the header is absent', () => {
    assert.equal(parseCurrentUser({headers: {}}), null)
})

test('returns null when the header is not valid JSON', () => {
    assert.equal(parseCurrentUser({headers: {'sepal-user': 'not-json'}}), null)
})
