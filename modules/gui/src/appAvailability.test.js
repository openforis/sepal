import {describe, expect, it} from 'vitest'

import {formatCatalogDate, isAppListed, removalDate, unavailableReason} from './appAvailability'

describe('unavailableReason', () => {
    it('leaves a plain app available', () => {
        expect(unavailableReason(app(), {serviceAccount: true})).toBeNull()
    })

    it('makes an app retired as soon as it has a retirement date, even a future one', () => {
        expect(unavailableReason(app({retiredOn: '2999-01-01'}), {serviceAccount: false})).toBe('retired')
    })

    it('ignores a malformed retirement date', () => {
        expect(unavailableReason(app({retiredOn: 'soon'}), {serviceAccount: false})).toBeNull()
    })

    it('keeps the existing disabled flag', () => {
        expect(unavailableReason(app({disabled: true}), {serviceAccount: false})).toBe('disabled')
    })

    it('requires a Google account only from service-account users', () => {
        const googleApp = app({googleAccountRequired: true})
        expect(unavailableReason(googleApp, {serviceAccount: true})).toBe('googleAccountRequired')
        expect(unavailableReason(googleApp, {serviceAccount: false})).toBeNull()
    })

    it('reports retirement before any other reason', () => {
        const retiredGoogleApp = app({retiredOn: '2026-01-01', disabled: true, googleAccountRequired: true})
        expect(unavailableReason(retiredGoogleApp, {serviceAccount: true})).toBe('retired')
    })
})

describe('isAppListed', () => {
    const retired = app({retiredOn: '2026-01-01'})

    it('lists a retired app for 60 days after its retirement date', () => {
        expect(isAppListed(retired, new Date('2026-03-01T23:59:59Z'))).toBe(true)
    })

    it('hides a retired app from the 60th day after its retirement date', () => {
        expect(isAppListed(retired, new Date('2026-03-02T00:00:00Z'))).toBe(false)
    })

    it('hides apps the catalog marks hidden', () => {
        expect(isAppListed(app({hidden: true}), new Date('2026-01-01'))).toBe(false)
    })

    it('lists an app with a malformed retirement date', () => {
        expect(isAppListed(app({retiredOn: '01/01/2020'}), new Date('2026-01-01'))).toBe(true)
    })
})

describe('removalDate', () => {
    it('is 60 days after the retirement date', () => {
        expect(removalDate(app({retiredOn: '2026-01-01'}))).toBe('2026-03-02')
    })

    it('is absent for an app that is not retired', () => {
        expect(removalDate(app())).toBeNull()
    })
})

describe('formatCatalogDate', () => {
    it('shows the catalog day in the given language, whatever the local time zone', () => {
        expect(formatCatalogDate('2026-01-31', 'en')).toBe('Jan 31, 2026')
    })

    it('shows nothing for a malformed date', () => {
        expect(formatCatalogDate('2026-1-31', 'en')).toBeNull()
    })
})

const app = fields => ({id: 'app', label: 'App', ...fields})
