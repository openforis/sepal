import assert from 'node:assert/strict'

// Matches the way Jest's toMatchObject did: an object needs only the properties the pattern names,
// but an array must match the pattern element for element. assert.partialDeepStrictEqual also accepts
// an array that merely contains the pattern's elements in order.
export const assertMatches = (actual, pattern, ...message) =>
    assert.deepEqual(projection(actual, pattern), pattern, ...message)

const projection = (actual, pattern) => {
    if (Array.isArray(pattern)) {
        return Array.isArray(actual)
            ? actual.map((value, i) => i < pattern.length ? projection(value, pattern[i]) : value)
            : actual
    }
    if (isPlainObject(pattern) && actual !== null && typeof actual === 'object' && !Array.isArray(actual)) {
        return Object.fromEntries(
            Object.keys(pattern)
                .filter(key => key in actual)
                .map(key => [key, projection(actual[key], pattern[key])])
        )
    }
    return actual
}

const isPlainObject = value =>
    value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
