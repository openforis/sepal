const {assembleSpecialistPrompt} = require('#mcp/chat/specialists/assembleSpecialistPrompt')

const BASE = 'BASE PROMPT CONTENT'

function aSpecWithFacts(overrides = {}) {
    return {
        id: 'MOSAIC',
        name: 'Optical Mosaic',
        promptFacts: () => ({
            description: 'A short recipe description.',
            useCases: ['use case one', 'use case two'],
            chooseWhen: 'pick when X',
            dontChooseWhen: 'avoid when Y',
            outputs: 'produces bands A, B, C'
        }),
        ...overrides
    }
}

describe('assembleSpecialistPrompt', () => {

    it('returns the base prompt unchanged when spec is null', () => {
        expect(assembleSpecialistPrompt(BASE, null)).toBe(BASE)
    })

    it('returns the base prompt unchanged when spec has no promptFacts method', () => {
        const spec = {id: 'UNKNOWN', name: 'Unknown'}

        expect(assembleSpecialistPrompt(BASE, spec)).toBe(BASE)
    })

    it('appends a type-specific section that names every promptFacts field for a spec with facts', () => {
        const out = assembleSpecialistPrompt(BASE, aSpecWithFacts())

        expect(out).toContain('A short recipe description.')
        expect(out).toContain('pick when X')
        expect(out).toContain('avoid when Y')
        expect(out).toContain('produces bands A, B, C')
        expect(out).toContain('use case one')
        expect(out).toContain('use case two')
    })

    it('renders each useCase as a bulleted line', () => {
        const out = assembleSpecialistPrompt(BASE, aSpecWithFacts())

        expect(out).toMatch(/^- use case one$/m)
        expect(out).toMatch(/^- use case two$/m)
    })

    it('places the base prompt before the type-specific section (cache alignment)', () => {
        const out = assembleSpecialistPrompt(BASE, aSpecWithFacts())

        expect(out.indexOf(BASE)).toBe(0)
        expect(out.indexOf('A short recipe description.')).toBeGreaterThan(BASE.length)
    })

    it('includes the spec id and name so the specialist knows what it is describing', () => {
        const out = assembleSpecialistPrompt(BASE, aSpecWithFacts())

        expect(out).toContain('MOSAIC')
        expect(out).toContain('Optical Mosaic')
    })
})
