import assert from 'node:assert/strict'
import {test} from 'node:test'

import {smtpFromDomain} from './config.js'
import {getFrom, renderHtml} from './email.js'

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
