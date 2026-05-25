const {assembleSpecialistPrompt} = require('#mcp/chat/specialists/assembleSpecialistPrompt')

const BASE = 'BASE PROMPT CONTENT'

function aSpec(overrides = {}) {
    return {
        id: 'MOSAIC',
        name: 'Optical Mosaic',
        describeFacts: () => ({
            description: 'A short recipe description.',
            outputs: 'produces bands A, B, C'
        }),
        schema: {type: 'object', properties: {mode: {enum: ['RAW'], 'x-enumLabels': {RAW: 'readable label'}}}},
        ...overrides
    }
}

describe('assembleSpecialistPrompt', () => {

    describe('shared behaviour', () => {

        it('returns the base prompt unchanged when spec is null', () => {
            expect(assembleSpecialistPrompt(BASE, null, {purpose: 'describe'})).toBe(BASE)
        })

        it('throws when purpose is missing — purpose is required so the caller picks the right facts bucket', () => {
            expect(() => assembleSpecialistPrompt(BASE, aSpec())).toThrow(/purpose/)
        })

        it('throws on an unknown purpose', () => {
            expect(() => assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'invent'})).toThrow(/purpose/)
        })

        it('places the base prompt at the start (cache-stable prefix)', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out.indexOf(BASE)).toBe(0)
        })

        it('includes the recipe type name without exposing the internal type id', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('Recipe type: Optical Mosaic')
            expect(out).not.toContain('MOSAIC')
        })
    })

    describe('purpose: describe', () => {

        it('renders description and outputs from describeFacts', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('A short recipe description.')
            expect(out).toContain('produces bands A, B, C')
        })

        it('renders schema-derived value labels so raw enum values can be translated in prose', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('Value labels:')
            expect(out).toContain('/mode: RAW(readable label)')
        })

        it('does NOT include selection-bucket fields (useCases / chooseWhen / dontChooseWhen)', () => {
            const spec = aSpec({
                selectionFacts: () => ({
                    description: 'unused',
                    useCases: ['use case one'],
                    chooseWhen: 'pick when X',
                    dontChooseWhen: 'avoid when Y',
                    outputs: 'unused'
                })
            })

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'describe'})

            expect(out).not.toMatch(/Choose when:/)
            expect(out).not.toMatch(/Use cases:/)
            expect(out).not.toContain('pick when X')
            expect(out).not.toContain('avoid when Y')
            expect(out).not.toContain('use case one')
        })

        it('does NOT embed the JSON schema (describe is read-only)', () => {
            const spec = aSpec({schema: {type: 'object', properties: {compositeOptions: {type: 'object'}}}})

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'describe'})

            expect(out).not.toContain('compositeOptions')
            expect(out).not.toMatch(/```json/)
        })

        it('returns the base prompt unchanged when the spec has no describeFacts', () => {
            const spec = {id: 'X', name: 'X'}

            expect(assembleSpecialistPrompt(BASE, spec, {purpose: 'describe'})).toBe(BASE)
        })
    })
})
