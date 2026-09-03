import {jest} from '@jest/globals'

import {sandboxInteractionRoute} from './sandboxInteractionRoute.js'

const res = () => {
    const r = {statusCode: null, body: null}
    r.status = jest.fn(code => { r.statusCode = code; return r })
    r.json = jest.fn(body => { r.body = body; return r })
    r.end = jest.fn(() => r)
    return r
}

const req = (query = {}, user = {username: 'alice'}) => ({
    query,
    headers: user ? {'sepal-user': JSON.stringify(user)} : {}
})

const setup = () => {
    const recordInteraction = jest.fn()
    const {handler} = sandboxInteractionRoute({recordInteraction})
    return {handler, recordInteraction}
}

test('reports an interaction for the named session', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({sessionId: 's1'}), response)
    expect(recordInteraction).toHaveBeenCalledWith(
        {username: 'alice', sessionId: 's1', observable: true})
    expect(response.statusCode).toBe(204)
})

test('observable=false is the cross-origin declaration', () => {
    const {handler, recordInteraction} = setup()
    handler(req({sessionId: 's1', observable: 'false'}), res())
    expect(recordInteraction).toHaveBeenCalledWith(
        {username: 'alice', sessionId: 's1', observable: false})
})

// Only an explicit `false` declares an app unobservable. Anything else — including a malformed
// report — leaves the session observable, so a broken GUI shows up as sessions expiring under
// active use rather than as the filter silently doing nothing.
test.each([['garbage'], ['0'], ['no'], [undefined]])('observable=%s still reads as observable', value => {
    const {handler, recordInteraction} = setup()
    handler(req({sessionId: 's1', ...(value === undefined ? {} : {observable: value})}), res())
    expect(recordInteraction.mock.calls[0][0].observable) .toBe(true)
})

test('400 without a session', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({}), response)
    expect(response.statusCode).toBe(400)
    expect(recordInteraction).not.toHaveBeenCalled()
})

test('400 without an authenticated user', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({sessionId: 's1'}, null), response)
    expect(response.statusCode).toBe(400)
    expect(recordInteraction).not.toHaveBeenCalled()
})
