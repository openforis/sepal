import {jest} from '@jest/globals'

// Mock config before importing email.js (which reads sepalHost from config at module load).
jest.unstable_mockModule('./config.js', () => ({
    sepalHost: 'sepal.example.org'
}))

const {email$, sendInvite, sendPasswordReset} = await import('./email.js')

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
