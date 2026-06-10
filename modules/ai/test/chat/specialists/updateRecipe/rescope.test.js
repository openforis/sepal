import {appendRescopeContext, combineTimelines, rescopeCandidates} from '#mcp/chat/specialists/updateRecipe/rescope'

const MOSAIC_PACKET = {writableHandles: ['cloudBuffer']}
const RECIPE_TYPE = 'MOSAIC'

describe('rescopeCandidates', () => {

    it('returns the known-but-out-of-scope handle when a VALIDATION_FAILED names it', () => {
        const outcome = anOutcome({
            attempted: true, succeeded: false,
            lastError: {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'snowMasking', message: 'must be ON'}]}
        })

        expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toEqual(['snowMasking'])
    })

    it('returns null when the named handle is already writable — the value needs fixing, not the scope', () => {
        const outcome = anOutcome({
            attempted: true, succeeded: false,
            lastError: {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'cloudBuffer', message: 'out of range'}]}
        })

        expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toBeNull()
    })

    it('returns null when the named handle is not in the recipe catalog (model invented it)', () => {
        const outcome = anOutcome({
            attempted: true, succeeded: false,
            lastError: {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'frobnicate', message: 'not real'}]}
        })

        expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toBeNull()
    })

    it('returns null for non-VALIDATION_FAILED error codes', () => {
        for (const code of ['INACTIVE_VALUE', 'STALE_WRITE', 'HANDLE_OUT_OF_SCOPE', 'TOOL_FAILED']) {
            const outcome = anOutcome({
                attempted: true, succeeded: false,
                lastError: {code, handleErrors: [{handle: 'snowMasking', message: '...'}]}
            })

            expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toBeNull()
        }
    })

    it('returns null when the attempt succeeded (nothing to rescue)', () => {
        const outcome = anOutcome({attempted: true, succeeded: true})

        expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toBeNull()
    })

    it('returns null when the attempt never ran (no patch history)', () => {
        const outcome = anOutcome({attempted: false, succeeded: false})

        expect(rescopeCandidates(outcome, MOSAIC_PACKET, RECIPE_TYPE)).toBeNull()
    })
})

describe('appendRescopeContext', () => {

    it('appends a factual sentence quoting the validation failure and naming the scope expansion', () => {
        const error = {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'snowMasking', message: 'must be ON when cloudBuffer > 0'}]}

        const note = appendRescopeContext(null, ['snowMasking'], error)

        expect(note).toMatch(/Previous update attempt failed validation/)
        expect(note).toContain('snowMasking: must be ON when cloudBuffer > 0')
        expect(note).toMatch(/Writable scope was expanded/)
    })

    it('preserves the prior context above the new note, separated by a blank line', () => {
        const error = {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'snowMasking', message: 'must be ON'}]}

        const note = appendRescopeContext('Earlier note.', ['snowMasking'], error)

        expect(note.startsWith('Earlier note.\n\n')).toBe(true)
    })

    it('omits handleErrors whose handle is not in the rescue set', () => {
        const error = {code: 'VALIDATION_FAILED', handleErrors: [
            {handle: 'snowMasking', message: 'must be ON'},
            {handle: 'unrelated', message: 'unrelated detail'}
        ]}

        const note = appendRescopeContext(null, ['snowMasking'], error)

        expect(note).toContain('snowMasking')
        expect(note).not.toContain('unrelated')
    })

    it('avoids any imperative framing — context is reference, not instructions', () => {
        const error = {code: 'VALIDATION_FAILED', handleErrors: [{handle: 'snowMasking', message: 'must be ON'}]}

        const note = appendRescopeContext(null, ['snowMasking'], error)

        expect(note).not.toMatch(/Preserve|Continue|Try|Please|You must/i)
    })
})

describe('combineTimelines', () => {

    it('returns the current timeline unchanged when there is no prior history', () => {
        const current = [{kind: 'tool', name: 'x'}]

        expect(combineTimelines(null, current)).toEqual(current)
        expect(combineTimelines([], current)).toEqual(current)
    })

    it('prepends prior entries to the current timeline, preserving order', () => {
        const prior = [{kind: 'tool', name: 'first', ok: false}]
        const current = [{kind: 'tool', name: 'second', ok: true}]

        expect(combineTimelines(prior, current)).toEqual([
            {kind: 'tool', name: 'first', ok: false},
            {kind: 'tool', name: 'second', ok: true}
        ])
    })
})

function anOutcome(overrides) {
    return {attempted: false, succeeded: false, lastError: null, ...overrides}
}
