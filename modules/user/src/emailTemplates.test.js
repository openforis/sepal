import {invitationContent, passwordResetContent, sshKeyAddedContent} from './emailTemplates.js'

test('invitationContent embeds the name and activation link', () => {
    const html = invitationContent({name: 'Ada'}, 'https://sepal.example/setup-account?token=T1')
    expect(html).toContain('Hello Ada,')
    expect(html).toContain('An account on SEPAL has been created for you.')
    expect(html).toContain('<a href="https://sepal.example/setup-account?token=T1">follow this link</a>')
})

test('passwordResetContent embeds the name, reset link, and the request/ignore/otherwise wording', () => {
    const html = passwordResetContent({name: 'Bo'}, 'https://sepal.example/reset-password?token=T2')
    expect(html).toContain('Hello Bo,')
    expect(html).toContain('<a href="https://sepal.example/reset-password?token=T2">follow this link</a>')
    expect(html).toContain('We received a request for resetting your SEPAL password.')
    expect(html).toContain('you can safely ignore this email')
    expect(html).toContain('Otherwise, please <a')
})

test('sshKeyAddedContent names the added key and says what to do if it was not the user', () => {
    const html = sshKeyAddedContent({name: 'Ada'}, aKey())

    expect(html).toContain('Hello Ada,')
    expect(html).toContain('An SSH key was added to your SEPAL account')
    expect(html).toContain('Laptop')
    expect(html).toContain('ssh-ed25519')
    expect(html).toContain('SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM')
    expect(html).toContain('2026-09-28T10:00:00.000Z')
    expect(html).toContain('If you did not add this key')
})

test('sshKeyAddedContent escapes the names it is given', () => {
    const html = sshKeyAddedContent({name: 'Ada <b>'}, aKey({name: '<script>alert(1)</script>'}))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Hello Ada &lt;b&gt;,')
})

const aKey = (over = {}) => ({
    id: 1, name: 'Laptop', type: 'ssh-ed25519', publicKey: 'AAAA',
    fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM', creationTime: '2026-09-28T10:00:00.000Z',
    ...over
})
