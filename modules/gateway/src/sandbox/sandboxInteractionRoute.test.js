import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {sandboxInteractionRoute} from './sandboxInteractionRoute.js'

const res = () => {
    const r = {statusCode: null, body: null}
    r.status = mock.fn(code => { r.statusCode = code; return r })
    r.json = mock.fn(body => { r.body = body; return r })
    r.end = mock.fn(() => r)
    return r
}

const req = (query = {}, user = {username: 'alice'}) => ({
    query,
    headers: user ? {'sepal-user': JSON.stringify(user)} : {}
})

const setup = () => {
    const recordInteraction = mock.fn()
    const {handler} = sandboxInteractionRoute({recordInteraction})
    return {handler, recordInteraction}
}

test('reports an interaction for the named session', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({sessionId: 's1'}), response)
    assert.deepEqual(
        callsOf(recordInteraction),
        [[{username: 'alice', sessionId: 's1', observable: true}]]
    )
    assert.equal(response.statusCode, 204)
})

test('observable=false is the cross-origin declaration', () => {
    const {handler, recordInteraction} = setup()
    handler(req({sessionId: 's1', observable: 'false'}), res())
    assert.deepEqual(
        callsOf(recordInteraction),
        [[{username: 'alice', sessionId: 's1', observable: false}]]
    )
})

// Only an explicit `false` declares an app unobservable. Anything else — including a malformed
// report — leaves the session observable, so a broken GUI shows up as sessions expiring under
// active use rather than as the filter silently doing nothing.
for (const [value] of [['garbage'], ['0'], ['no'], [undefined]]) {
    test(`observable=${value} still reads as observable`, () => {
        const {handler, recordInteraction} = setup()
        handler(req({sessionId: 's1', ...(value === undefined ? {} : {observable: value})}), res())
        assert.equal(recordInteraction.mock.calls[0].arguments[0].observable, true)
    })
}

test('400 without a session', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({}), response)
    assert.equal(response.statusCode, 400)
    assert.equal(recordInteraction.mock.callCount(), 0)
})

test('400 without an authenticated user', () => {
    const {handler, recordInteraction} = setup()
    const response = res()
    handler(req({sessionId: 's1'}, null), response)
    assert.equal(response.statusCode, 400)
    assert.equal(recordInteraction.mock.callCount(), 0)
})
