import {jest} from '@jest/globals'

// Mock config before importing email.js (which reads sepalHost from config at module load).
jest.unstable_mockModule('./config.js', () => ({
    sepalHost: 'sepal.example.org'
}))

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
    expect(msg.to).toBe('lookap+28@gmail.com')
    expect(msg.forceEmailNotificationEnabled, 'transactional reset email must be force-delivered').toBe(true)
})

test('sendInvite forces email delivery', () => {
    const msg = capture(() => sendInvite(user, 'tok'))
    expect(msg.forceEmailNotificationEnabled).toBe(true)
})

test('sendSshKeyAdded force-delivers a security notice to the user', () => {
    const key = {id: 1, name: 'Laptop', type: 'ssh-ed25519', fingerprint: 'SHA256:x', creationTime: '2026-09-28T10:00:00.000Z'}

    const msg = capture(() => sendSshKeyAdded(user, key))

    expect(msg.to).toBe(user.email)
    expect(msg.subject).toBe('SEPAL: SSH key added')
    expect(msg.forceEmailNotificationEnabled, 'a security notice must not be opted out of').toBe(true)
})
