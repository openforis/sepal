import assert from 'node:assert/strict'
import {test} from 'node:test'

import {generateApiKey, hashApiKey} from './apiKey.js'

test('a task key carries the prefix the gateway routes it by, and every key is new', () => {
    const key = generateApiKey()

    assert.match(key, /^task_/)
    assert.notEqual(generateApiKey(), key)
})

test('a key is stored as a hash that names it alone', () => {
    const key = generateApiKey()

    assert.match(hashApiKey(key), /^[0-9a-f]{64}$/)
    assert.equal(hashApiKey(key), hashApiKey(key))
    assert.notEqual(hashApiKey(generateApiKey()), hashApiKey(key))
})
