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
            messageKey: 'tasks.samplingDesign.systematic.underproduced.minDistanceLimit',
            messageArgs: {strata: 'trees (stratum 1): 231 available / 373 requested'},
            defaultMessage: 'Sampling could not create enough sample candidates while respecting the minimum distance. Affected strata: {strata}. Try reducing the sample size for those strata.'
        })
        const result = taskStatusDescription({statusDescription})
        expect(result).toContain('Affected strata: trees (stratum 1): 231 available / 373 requested')
        expect(result).not.toContain('messageKey')
        expect(result).not.toContain('{"')
        expect(result).not.toContain('{strata}')
    })
})
