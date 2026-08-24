// expiryToken — the credential in the expiry email's extend link (§5a).
//
// An HMAC over (sessionId, notifiedTime) with a server-side secret, valid until
// notified_time + graceMinutes. It has to work from a phone with no SEPAL session, so it carries
// its own authority; binding it to notified_time is what gives it single-use semantics — but only
// in combination with a guarded redemption, because the HMAC alone proves nothing about whether it
// has already been spent and two concurrent clicks both verify. Redemption is
// `UPDATE … WHERE notified_time = ?` (the ratchet clears notified_time), so only the transaction
// that changed a row acts.
//
// The secret defaults to a random per-process value: without one configured, links simply stop
// working across a restart, which is a far better failure than a predictable signing key.

import crypto from 'crypto'

const SEPARATOR = '.'

const base64url = buffer => buffer.toString('base64url')

const toEpochSeconds = time => Math.floor(new Date(time).getTime() / 1000)

const createExpiryTokens = ({secret = crypto.randomBytes(32).toString('hex'), graceMinutes = 60} = {}) => {
    const sign = payload =>
        base64url(crypto.createHmac('sha256', secret).update(payload).digest())

    // token = <sessionId>.<notifiedTimeEpochSeconds>.<hmac>
    const create = ({sessionId, notifiedTime}) => {
        if (!sessionId || !notifiedTime) {
            return null
        }
        const payload = `${sessionId}${SEPARATOR}${toEpochSeconds(notifiedTime)}`
        return `${base64url(Buffer.from(payload))}${SEPARATOR}${sign(payload)}`
    }

    // verify — returns {sessionId, notifiedTime} or null. Null covers every failure mode
    // (malformed, tampered, expired) on purpose: the caller renders one "this link is no longer
    // valid" page either way, and distinguishing them would only help someone probing tokens.
    const verify = (token, now = new Date()) => {
        if (typeof token !== 'string') {
            return null
        }
        const [encodedPayload, signature] = token.split(SEPARATOR)
        if (!encodedPayload || !signature) {
            return null
        }
        let payload
        try {
            payload = Buffer.from(encodedPayload, 'base64url').toString()
        } catch (_error) {
            return null
        }
        const expected = sign(payload)
        const given = Buffer.from(signature)
        // Length-mismatched buffers make timingSafeEqual throw rather than return false.
        if (given.length !== expected.length
            || !crypto.timingSafeEqual(given, Buffer.from(expected))) {
            return null
        }
        const [sessionId, notifiedSeconds] = payload.split(SEPARATOR)
        const notifiedTime = new Date(Number(notifiedSeconds) * 1000)
        if (!sessionId || Number.isNaN(notifiedTime.getTime())) {
            return null
        }
        if (now.getTime() > notifiedTime.getTime() + graceMinutes * 60_000) {
            return null
        }
        return {sessionId, notifiedTime}
    }

    return {create, verify}
}

export {createExpiryTokens}
