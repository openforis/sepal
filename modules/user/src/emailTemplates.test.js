import assert from 'node:assert/strict'
import {test} from 'node:test'

import {invitationContent, passwordResetContent, sshKeyAddedContent} from './emailTemplates.js'

test('invitationContent embeds the name and activation link', () => {
    const html = invitationContent({name: 'Ada'}, 'https://sepal.example/setup-account?token=T1')
    assert.ok(html.includes('Hello Ada,'))
    assert.ok(html.includes('An account on SEPAL has been created for you.'))
    assert.ok(html.includes(
        '<a href="https://sepal.example/setup-account?token=T1">follow this link</a>'
    ))
})

test('passwordResetContent embeds the name, reset link, and the request/ignore/otherwise wording', () => {
    const html = passwordResetContent({name: 'Bo'}, 'https://sepal.example/reset-password?token=T2')
    assert.ok(html.includes('Hello Bo,'))
    assert.ok(html.includes(
        '<a href="https://sepal.example/reset-password?token=T2">follow this link</a>'
    ))
    assert.ok(html.includes('We received a request for resetting your SEPAL password.'))
    assert.ok(html.includes('you can safely ignore this email'))
    assert.ok(html.includes('Otherwise, please <a'))
})

test('sshKeyAddedContent names the added key and says what to do if it was not the user', () => {
    const html = sshKeyAddedContent({name: 'Ada'}, aKey())

    assert.ok(html.includes('Hello Ada,'))
    assert.ok(html.includes('An SSH key was added to your SEPAL account'))
    assert.ok(html.includes('Laptop'))
    assert.ok(html.includes('ssh-ed25519'))
    assert.ok(html.includes('SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM'))
    assert.ok(html.includes('2026-09-28T10:00:00.000Z'))
    assert.ok(html.includes('If you did not add this key'))
})

test('sshKeyAddedContent escapes the names it is given', () => {
    const html = sshKeyAddedContent({name: 'Ada <b>'}, aKey({name: '<script>alert(1)</script>'}))

    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
    assert.ok(html.includes('Hello Ada &lt;b&gt;,'))
})

const aKey = (over = {}) => ({
    id: 1, name: 'Laptop', type: 'ssh-ed25519', publicKey: 'AAAA',
    fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM', creationTime: '2026-09-28T10:00:00.000Z',
    ...over
})
