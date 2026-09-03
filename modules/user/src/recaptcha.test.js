import {jest} from '@jest/globals'

// Mock config before importing recaptcha.js (which imports config at module load).
jest.unstable_mockModule('./config.js', () => ({
    googleProjectId: 'proj',
    recaptchaApiKey: 'key',
    recaptchaMinScore: 0.7,
    recaptchaOptional: false,
    recaptchaSiteKey: 'site',
    sepalHost: 'https://sepal.example.org'
}))

const {createRecaptcha} = await import('./recaptcha.js')

test('optional=true bypasses verification (always valid)', async () => {
    let called = false
    const verify = async () => { called = true; return false }
    const recaptcha = createRecaptcha({optional: true, verify})
    expect(await recaptcha.isValid('any', 'SIGN_UP')).toBe(true)
    expect(called).toBe(false)
})

test('optional=false delegates to the injected verifier', async () => {
    const calls = []
    const verify = async (token, action) => { calls.push([token, action]); return token === 'good' }
    const recaptcha = createRecaptcha({optional: false, verify})
    expect(await recaptcha.isValid('good', 'VALIDATE_USERNAME')).toBe(true)
    expect(await recaptcha.isValid('bad', 'VALIDATE_EMAIL')).toBe(false)
    expect(calls).toEqual([['good', 'VALIDATE_USERNAME'], ['bad', 'VALIDATE_EMAIL']])
})
