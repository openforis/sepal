import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

const smtpFromDomain = 'sepal.test'

// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {
    exports: {smtpFromDomain, smtpHost: 'smtp.test', smtpPort: 25, smtpSecure: false, smtpUser: 'user', smtpPassword: 'password'}
})

const sendMail = mock.fn(async () => ({}))
mock.module('nodemailer', {
    exports: {default: {createTransport: () => ({verify: async () => true, sendMail})}}
})
const {getFrom, renderHtml, send} = await import('./email.js')

test('rejects when the mail server fails, so the queue retries the job', async () => {
    sendMail.mock.mockImplementationOnce(async () => {
        throw new Error('421 try again later')
    })
    await assert.rejects(send({id: 1, email: {to: 'a@example.org', content: 'hi'}}), /421/)
})

test('drops an email with an unknown content type without sending it', async () => {
    sendMail.mock.resetCalls()
    await send({id: 1, email: {to: 'a@example.org', content: 'hi', contentType: 'image/png'}})
    assert.equal(sendMail.mock.callCount(), 0)
})

test('sends from sepal-<module> at the configured domain', () => {
    assert.equal(getFrom('worker'), `sepal-worker@${smtpFromDomain}`)
})

test('keeps a full sender address unchanged', () => {
    assert.equal(getFrom('someone@example.org'), 'someone@example.org')
})

test('sends from no-reply when no sender is given', () => {
    assert.equal(getFrom(undefined), `no-reply@${smtpFromDomain}`)
})

test('renders text/html content without throwing (regression: SafeString has no .trim)', () => {
    const html = renderHtml({subject: 'Sepal Password Reset', content: '<p>Hello</p>', contentType: 'text/html'})
    assert.equal(typeof html, 'string')
    assert.ok(html.includes('<p>Hello</p>'), 'rendered email should contain the html body')
})

test('renders text/plain content', () => {
    const html = renderHtml({subject: 'Hi', content: 'plain body', contentType: 'text/plain'})
    assert.ok(html.includes('plain body'))
})

test('renders text/markdown content', () => {
    const html = renderHtml({subject: 'Hi', content: '# Heading', contentType: 'text/markdown'})
    assert.ok(html.includes('Heading'))
})

test('returns empty string for empty content', () => {
    assert.equal(renderHtml({subject: 'Hi', content: '', contentType: 'text/plain'}), '')
})

test('returns empty string for whitespace-only html content', () => {
    assert.equal(renderHtml({subject: 'Hi', content: '   ', contentType: 'text/html'}), '')
})
