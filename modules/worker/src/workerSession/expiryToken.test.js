// Unit tests for the expiry email's management token.
//
// ONE token per notified session, authorising that session's expiry decision — either of them.
// The mail carries a single link to a page offering both buttons, so signing the action into the
// token would protect nothing: whoever can reach the page can reach both forms.
//
// The token proves only that a well-formed link was clicked — single-use comes from the guarded
// redemption in the repository, not from here. What these tests pin is that a token cannot be
// forged, cannot outlive its grace period, and never throws on garbage input.

import {createExpiryTokens} from './expiryToken.js'

const NOW = new Date('2026-08-13T12:00:00Z')
const notifiedTime = new Date('2026-08-13T11:30:00Z')

const tokens = createExpiryTokens({secret: 'test-secret', graceMinutes: 60})

describe('create / verify', () => {
    test('round-trips the session and the notified time', () => {
        const claim = tokens.verify(tokens.create({sessionId: 's-1', notifiedTime}), NOW)
        expect(claim).toEqual({sessionId: 's-1', notifiedTime})
    })

    test('needs both a session and a notified time', () => {
        expect(tokens.create({sessionId: 's-1', notifiedTime: null})).toBeNull()
        expect(tokens.create({sessionId: null, notifiedTime})).toBeNull()
    })
})

describe('forgery', () => {
    const token = tokens.create({sessionId: 's-1', notifiedTime})

    test('a token signed with another secret does not verify', () => {
        const other = createExpiryTokens({secret: 'other-secret', graceMinutes: 60})
        expect(tokens.verify(other.create({sessionId: 's-1', notifiedTime}), NOW)).toBeNull()
    })

    // A token names ONE session. Pointing it at another is the forgery that matters here, since
    // the page it opens can stop whatever session the claim names.
    test('a token cannot be repointed at another session', () => {
        const [, signature] = token.split('.')
        const forged = Buffer.from('s-2.1000000000').toString('base64url')
        expect(tokens.verify(`${forged}.${signature}`, NOW)).toBeNull()
    })

    test('a tampered signature does not verify', () => {
        const [payload] = token.split('.')
        expect(tokens.verify(`${payload}.aaaa`, NOW)).toBeNull()
    })
})

describe('expiry', () => {
    test('valid until notified_time + grace', () => {
        const token = tokens.create({sessionId: 's-1', notifiedTime})
        const atGrace = new Date(notifiedTime.getTime() + 60 * 60_000)
        expect(tokens.verify(token, atGrace)).not.toBeNull()
        expect(tokens.verify(token, new Date(atGrace.getTime() + 1000))).toBeNull()
    })
})

describe('garbage input', () => {
    // Every failure mode returns null rather than throwing: the caller renders one "no longer
    // valid" page either way, and distinguishing them would only help someone probing tokens.
    test.each([
        ['undefined', undefined],
        ['null', null],
        ['a number', 42],
        ['empty', ''],
        ['no separator', 'abcdef'],
        ['non-base64 payload', '!!!.###'],
        ['a short signature', `${Buffer.from('s-1.1000').toString('base64url')}.x`],
    ])('%s → null, never a throw', (_name, value) => {
        expect(tokens.verify(value, NOW)).toBeNull()
    })
})

describe('the default secret', () => {
    // Without a configured secret, links stop working across a restart. That is a far better
    // failure than a predictable signing key.
    test('is random per process, so tokens do not survive a restart', () => {
        const first = createExpiryTokens({graceMinutes: 60})
        const second = createExpiryTokens({graceMinutes: 60})
        expect(second.verify(first.create({sessionId: 's-1', notifiedTime}), NOW)).toBeNull()
    })
})
