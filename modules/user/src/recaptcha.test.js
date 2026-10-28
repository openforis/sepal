import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

// Mock config before importing recaptcha.js (which imports config at module load).
mock.module('./config.js', {
    exports: {
        googleProjectId: 'proj',
        recaptchaApiKey: 'key',
        recaptchaMinScore: 0.7,
        recaptchaOptional: false,
        recaptchaSiteKey: 'site',
        sepalHost: 'https://sepal.example.org'
    }
})

const {createRecaptcha} = await import('./recaptcha.js')

test('optional=true bypasses verification (always valid)', async () => {
    let called = false
    const verify = async () => { called = true; return false }
    const recaptcha = createRecaptcha({optional: true, verify})
    assert.equal(await recaptcha.isValid('any', 'SIGN_UP'), true)
    assert.equal(called, false)
})

test('optional=false delegates to the injected verifier', async () => {
    const calls = []
    const verify = async (token, action) => { calls.push([token, action]); return token === 'good' }
    const recaptcha = createRecaptcha({optional: false, verify})
    assert.equal(await recaptcha.isValid('good', 'VALIDATE_USERNAME'), true)
    assert.equal(await recaptcha.isValid('bad', 'VALIDATE_EMAIL'), false)
    assert.deepEqual(calls, [['good', 'VALIDATE_USERNAME'], ['bad', 'VALIDATE_EMAIL']])
})
