import {invitationContent, passwordResetContent} from './emailTemplates.js'

test('invitationContent embeds the name and activation link', () => {
    const html = invitationContent({name: 'Ada'}, 'https://sepal.example/setup-account?token=T1')
    expect(html).toContain('Hello Ada,')
    expect(html).toContain('An account on SEPAL has been created for you.')
    expect(html).toContain('href="https://sepal.example/setup-account?token=T1"')
})

test('passwordResetContent embeds the name, reset link, and the request/ignore/otherwise wording', () => {
    const html = passwordResetContent({name: 'Bo'}, 'https://sepal.example/reset-password?token=T2')
    expect(html).toContain('Hello Bo,')
    expect(html).toContain('href="https://sepal.example/reset-password?token=T2"')
    expect(html).toContain('We received a request for resetting your SEPAL password.')
    expect(html).toContain('you can safely ignore this email')
    expect(html).toContain('Otherwise, please follow')
})
