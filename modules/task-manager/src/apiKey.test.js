import {generateApiKey, hashApiKey, isTaskApiKey} from './apiKey.js'

test('a task key is recognisable as one, and every key is new', () => {
    const key = generateApiKey()

    expect(isTaskApiKey(key)).toBe(true)
    expect(isTaskApiKey('worker-session-key')).toBe(false)
    expect(generateApiKey()).not.toBe(key)
})

test('a key is stored as a hash that names it alone', () => {
    const key = generateApiKey()

    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiKey(key)).toBe(hashApiKey(key))
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(key))
})
