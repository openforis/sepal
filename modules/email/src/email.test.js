import assert from 'node:assert/strict'
import {test} from 'node:test'

import {renderHtml} from './email.js'

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
