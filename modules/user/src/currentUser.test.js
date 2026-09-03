import {parseCurrentUser} from './currentUser.js'

test('parses a valid sepal-user header', () => {
    const ctx = {headers: {'sepal-user': JSON.stringify({username: 'bob', roles: []})}}
    expect(parseCurrentUser(ctx)).toEqual({username: 'bob', roles: []})
})

test('returns null when the header is absent', () => {
    expect(parseCurrentUser({headers: {}})).toBeNull()
})

test('returns null when the header is not valid JSON', () => {
    expect(parseCurrentUser({headers: {'sepal-user': 'not-json'}})).toBeNull()
})
