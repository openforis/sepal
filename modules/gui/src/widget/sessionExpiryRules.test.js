import {describe, expect, it} from 'vitest'

import {staleWarnings} from './sessionExpiryRules'

const session = (id, state) => ({id, expiry: {state}})

describe('staleWarnings', () => {
    // The design's promise is that ANY extension cancels the expiry cycle — including the common
    // case where nobody touches the notification and simply goes back to typing. The ratchet resets
    // notification_state to NONE and the session ws pushes the new report; this is the browser
    // acting on it.
    it('withdraws a warning for a session that was rescued', () => {
        expect(staleWarnings(new Set(['s-1']), [session('s-1', 'NONE')])).toEqual(['s-1'])
    })

    it('leaves a warning up while the session is still notified', () => {
        expect(staleWarnings(new Set(['s-1']), [session('s-1', 'NOTIFIED')])).toEqual([])
        expect(staleWarnings(new Set(['s-1']), [session('s-1', 'EMAILED')])).toEqual([])
    })

    // Dismiss means "I saw it, don't email me". The toast is already gone by the user's own click,
    // and the session is still on its way to closing — so DISMISSED must not read as a rescue.
    it('does not treat DISMISSED as a rescue', () => {
        expect(staleWarnings(new Set(['s-1']), [session('s-1', 'DISMISSED')])).toEqual([])
    })

    // Stopped by hand, or closed by anything else: a warning for an instance that no longer exists
    // offers buttons that can only fail.
    it('withdraws a warning for a session that has gone', () => {
        expect(staleWarnings(new Set(['s-1']), [session('s-2', 'NOTIFIED')])).toEqual(['s-1'])
        expect(staleWarnings(new Set(['s-1']), [])).toEqual(['s-1'])
    })

    it('copes with a report that has not arrived yet', () => {
        expect(staleWarnings(new Set(['s-1']), undefined)).toEqual(['s-1'])
    })

    it('only considers warnings this browser actually has on screen', () => {
        expect(staleWarnings(new Set(), [session('s-1', 'NONE')])).toEqual([])
    })

    it('withdraws several at once', () => {
        const sessions = [session('s-1', 'NONE'), session('s-2', 'NOTIFIED'), session('s-3', 'NONE')]
        expect(staleWarnings(new Set(['s-1', 's-2', 's-3']), sessions)).toEqual(['s-1', 's-3'])
    })
})
