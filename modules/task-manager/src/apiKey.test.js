import assert from 'node:assert/strict'
import {test} from 'node:test'

import {generateApiKey, hashApiKey, isTaskApiKey} from './apiKey.js'

test('a task key is recognisable as one, and every key is new', () => {
    const key = generateApiKey()

    assert.equal(isTaskApiKey(key), true)
    assert.equal(isTaskApiKey('worker-session-key'), false)
    assert.notEqual(generateApiKey(), key)
})

test('a key is stored as a hash that names it alone', () => {
    const key = generateApiKey()

    assert.match(hashApiKey(key), /^[0-9a-f]{64}$/)
    assert.equal(hashApiKey(key), hashApiKey(key))
    assert.notEqual(hashApiKey(generateApiKey()), hashApiKey(key))
})
