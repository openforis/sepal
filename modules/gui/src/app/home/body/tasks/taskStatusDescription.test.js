import {describe, expect, it, vi} from 'vitest'

// msg() relies on a lazily-initialized react-intl instance; mock it to a deterministic formatter that
// interpolates the defaultMessage template (or echoes the key when no defaultMessage is given).
vi.mock('~/translate', () => ({
    msg: (id, values = {}, defaultMessage) =>
        (defaultMessage || id).replace(/\{(\w+)}/g, (_match, key) => values?.[key] ?? '')
}))

const {taskStatusDescription} = await import('./taskStatusDescription')

describe('taskStatusDescription', () => {
    it('returns a plain-string statusDescription as-is', () => {
        expect(taskStatusDescription({statusDescription: 'Stopping...'})).toBe('Stopping...')
    })

    it('localizes a JSON descriptor via messageKey + messageArgs (defaultMessage template)', () => {
        const task = {statusDescription: JSON.stringify({
            messageKey: 'tasks.status.someKey',
            messageArgs: {thing: 'export'},
            defaultMessage: 'The {thing} is running'
        })}
        expect(taskStatusDescription(task)).toBe('The export is running')
    })

    it('uses defaultMessage when a JSON descriptor has no messageKey', () => {
        const task = {statusDescription: JSON.stringify({defaultMessage: 'Google Earth Engine is exporting.'})}
        expect(taskStatusDescription(task)).toBe('Google Earth Engine is exporting.')
    })

    it('falls back to the generic executing status when missing', () => {
        expect(taskStatusDescription({})).toBe('tasks.status.executing')
        expect(taskStatusDescription({statusDescription: null})).toBe('tasks.status.executing')
    })

    it('falls back to the generic executing status for an empty string', () => {
        expect(taskStatusDescription({statusDescription: ''})).toBe('tasks.status.executing')
    })

    it('replaces the legacy tasks.status.failed descriptor with the generic message (no raw error)', () => {
        const task = {statusDescription: JSON.stringify({
            messageKey: 'tasks.status.failed',
            messageArgs: {error: 'ServerException: boom'},
            defaultMessage: '{error}'
        })}
        const result = taskStatusDescription(task)
        expect(result).toBe('tasks.status.failedGeneric')
        expect(result).not.toContain('ServerException')
    })

    it('replaces a technical-looking plain string with the generic message (no raw error)', () => {
        const result = taskStatusDescription({statusDescription: 'ServerException: boom'})
        expect(result).toBe('tasks.status.failedGeneric')
        expect(result).not.toContain('ServerException')
    })

    it('keeps Earth Engine error messages visible', () => {
        const task = {statusDescription: JSON.stringify({
            messageKey: 'gee.error.earthEngineException',
            messageArgs: {earthEngineMessage: 'Computation timed out.'},
            defaultMessage: 'Earth Engine: {earthEngineMessage}'
        })}
        expect(taskStatusDescription(task)).toBe('Earth Engine: Computation timed out.')
    })

    it('renders a structured Sampling Design failure as clean text, not raw JSON', () => {
        const statusDescription = JSON.stringify({
            messageKey: 'tasks.samplingDesign.preflight.belowStatisticalMinimum.samples',
            messageArgs: {floor: 2, strata: 'snow (1)'},
            defaultMessage: 'Problem for {strata}; minimum {floor}.'
        })
        const result = taskStatusDescription({statusDescription})
        // The interpolated per-stratum detail is present (surrounding prose may change freely)...
        expect(result).toContain('snow (1)')
        // ...and no raw JSON / messageKey / uninterpolated placeholder leaks through.
        expect(result).not.toContain('messageKey')
        expect(result).not.toContain('{"')
        expect(result).not.toContain('{strata}')
    })

    // Underproduction advice arrives as a structured list: every diagnosis/action must be translated by its
    // own key, not dumped as the pre-rendered English `details`.
    describe('structured underproduction advice', () => {
        const withAdvice = advice => ({statusDescription: JSON.stringify({
            messageKey: 'tasks.samplingDesign.underproduction.message',
            messageArgs: {details: 'ENGLISH FALLBACK DETAILS', advice},
            defaultMessage: 'Outer. {details}'
        })})

        it('translates each diagnosis and action by key instead of using the English details', () => {
            const result = taskStatusDescription(withAdvice([{
                kind: 'statisticalMinimum',
                diagnosis: {key: 'tasks.samplingDesign.underproduction.diagnosis.statisticalMinimum', args: {strata: 'snow (1)', minimum: 2}, message: 'D {strata} {minimum}'},
                actions: [{key: 'tasks.samplingDesign.underproduction.switchToRandom', args: {}, message: 'A'}]
            }]))
            expect(result).not.toContain('ENGLISH FALLBACK DETAILS')
            expect(result).toContain('snow (1)')
            expect(result).not.toContain('{strata}')
            expect(result).not.toContain('{details}')
        })

        it('renders actions on separate lines and separates diagnosis groups', () => {
            const result = taskStatusDescription(withAdvice([
                {kind: 'statisticalMinimum', diagnosis: {key: 'k.a', args: {}, message: 'DIAG-A'}, actions: [{key: 'k.a1', args: {}, message: 'ACT-A1'}]},
                {kind: 'requestedAllocation', diagnosis: {key: 'k.b', args: {}, message: 'DIAG-B'}, actions: [{key: 'k.b1', args: {}, message: 'ACT-B1'}]}
            ]))
            expect(result.slice(result.indexOf('DIAG-A')))
                .toBe('DIAG-A\n- ACT-A1\n\nDIAG-B\n- ACT-B1')
        })

        it('falls back to the plain message when no advice is attached', () => {
            const statusDescription = JSON.stringify({
                messageKey: 'tasks.samplingDesign.underproduction.message',
                messageArgs: {details: 'PLAIN DETAILS'},
                defaultMessage: 'Outer. {details}'
            })
            expect(taskStatusDescription({statusDescription})).toContain('PLAIN DETAILS')
        })
    })
})

describe('unsupported-CRS message localization', () => {
    it('renders the backend descriptor without unresolved placeholders or WKT', () => {
        const statusDescription = JSON.stringify({
            messageKey: 'tasks.samplingDesign.systematic.grid.unsupportedCrs',
            messageArgs: {supported: 'EPSG:6933 - EASE-Grid 2.0 Global'},
            defaultMessage: 'Supported: {supported}'
        })
        const result = taskStatusDescription({statusDescription})
        expect(result).not.toMatch(/\{/)
        expect(result).not.toMatch(/PROJCS|WKT/)
        expect(result).toContain('EPSG:6933 - EASE-Grid 2.0 Global')
    })
})
