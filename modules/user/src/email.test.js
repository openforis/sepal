import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

// Mock config before importing email.js (which reads sepalHost from config at module load).
mock.module('./config.js', {
    exports: {
        sepalHost: 'sepal.example.org'
    }
})

const {email$, sendInvite, sendPasswordReset, sendSshKeyAdded} = await import('./email.js')

const user = {username: 'lookap28', name: 'Luca', email: 'lookap+28@gmail.com'}

// Capture the message synchronously emitted on email$ while running fn.
const capture = fn => {
    let captured
    const subscription = email$.subscribe(msg => {
        captured = msg
    })
    fn()
    subscription.unsubscribe()
    return captured
}

test('sendPasswordReset forces email delivery, bypassing the notification preference', () => {
    const msg = capture(() => sendPasswordReset(user, 'tok'))
    assert.equal(msg.to, 'lookap+28@gmail.com')
    assert.equal(
        msg.forceEmailNotificationEnabled,
        true,
        'transactional reset email must be force-delivered'
    )
})

test('sendInvite forces email delivery', () => {
    const msg = capture(() => sendInvite(user, 'tok'))
    assert.equal(msg.forceEmailNotificationEnabled, true)
})

test('sendSshKeyAdded force-delivers a security notice to the user', () => {
    const key = {id: 1, name: 'Laptop', type: 'ssh-ed25519', fingerprint: 'SHA256:x', creationTime: '2026-09-28T10:00:00.000Z'}

    const msg = capture(() => sendSshKeyAdded(user, key))

    assert.equal(msg.to, user.email)
    assert.equal(msg.subject, 'SEPAL: SSH key added')
    assert.equal(
        msg.forceEmailNotificationEnabled,
        true,
        'a security notice must not be opted out of'
    )
})
