import {describe, expect, it, vi} from 'vitest'

// apps.jsx transitively imports ~/api/ws (via api registry usage in the tree) — stub the
// live-socket module like the sibling test files do.
vi.mock('~/api/ws', () => ({
    event$: {pipe: () => ({subscribe: () => ({unsubscribe: () => {}})})},
    clientId$: {subscribe: () => ({unsubscribe: () => {}})},
    getClientId: () => undefined
}))
vi.mock('~/apiRegistry', () => ({default: {apps: {}}}))

import {createTabPrefix} from './apps'

describe('createTabPrefix', () => {
    const sessions = [{id: 's-1'}, {id: 's-2'}]

    it('prefixes a tab with its session\'s 1-based instance number', () => {
        const tabPrefixFor = createTabPrefix()
        const tabPrefix = tabPrefixFor(sessions)
        expect(tabPrefix({sessionId: 's-2'})).toBe('2:')
    })

    it('returns no prefix for unknown or missing sessions', () => {
        const tabPrefixFor = createTabPrefix()
        const tabPrefix = tabPrefixFor(sessions)
        expect(tabPrefix({sessionId: 's-9'})).toBeUndefined()
        expect(tabPrefix({})).toBeUndefined()
        expect(tabPrefixFor(undefined)({sessionId: 's-1'})).toBeUndefined()
    })

    it('keeps the SAME function identity for the same session list', () => {
        // Unrelated re-renders must not force the pure Tabs widget to re-render.
        const tabPrefixFor = createTabPrefix()
        expect(tabPrefixFor(sessions)).toBe(tabPrefixFor(sessions))
    })

    it('returns a NEW function identity when the session list changes', () => {
        // Load-bearing: Tabs is a PURE connected component mapping only apps.tabs, and
        // every other prop it gets is identity-stable — a report-only change re-renders
        // the tab handles ONLY because this prop's identity changes with the report.
        // Without this, a freshly stamped tab shows no instance number until some
        // unrelated tabs mutation (the "number not immediately reflected" bug).
        const tabPrefixFor = createTabPrefix()
        const before = tabPrefixFor(sessions)
        const after = tabPrefixFor([...sessions, {id: 's-3'}])
        expect(after).not.toBe(before)
        expect(after({sessionId: 's-3'})).toBe('3:')
    })
})
