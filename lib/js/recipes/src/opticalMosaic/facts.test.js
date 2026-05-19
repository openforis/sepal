const {getRecipeSpec} = require('../index')

const MOSAIC = 'MOSAIC'

describe('MOSAIC.selectionFacts — orchestrator picks a recipe type', () => {

    it('exposes description / useCases / chooseWhen / dontChooseWhen / outputs', () => {
        const facts = getRecipeSpec(MOSAIC).selectionFacts()

        expect(Object.keys(facts).sort()).toEqual([
            'chooseWhen', 'description', 'dontChooseWhen', 'outputs', 'useCases'
        ])
    })

    it('useCases is a non-empty array of non-empty strings', () => {
        const facts = getRecipeSpec(MOSAIC).selectionFacts()

        expect(Array.isArray(facts.useCases)).toBe(true)
        expect(facts.useCases.length).toBeGreaterThan(0)
        facts.useCases.forEach(useCase => {
            expect(typeof useCase).toBe('string')
            expect(useCase.length).toBeGreaterThan(0)
        })
    })

    it('description / chooseWhen / dontChooseWhen / outputs are non-empty strings', () => {
        const facts = getRecipeSpec(MOSAIC).selectionFacts()

        for (const field of ['description', 'chooseWhen', 'dontChooseWhen', 'outputs']) {
            expect(typeof facts[field]).toBe('string')
            expect(facts[field].length).toBeGreaterThan(0)
        }
    })
})

describe('MOSAIC.describeFacts — describe_recipe consumer', () => {

    it('exposes description / outputs and no selection-bucket fields', () => {
        const facts = getRecipeSpec(MOSAIC).describeFacts()

        expect(Object.keys(facts).sort()).toEqual(['description', 'outputs'])
    })

    it('describe facts do not leak selection-only fields (useCases / chooseWhen / dontChooseWhen)', () => {
        const facts = getRecipeSpec(MOSAIC).describeFacts()

        expect(facts).not.toHaveProperty('useCases')
        expect(facts).not.toHaveProperty('chooseWhen')
        expect(facts).not.toHaveProperty('dontChooseWhen')
    })
})

describe('MOSAIC.editFacts — update_recipe consumer', () => {

    it('exposes guidance as a non-empty array of non-empty strings', () => {
        const facts = getRecipeSpec(MOSAIC).editFacts()

        expect(Array.isArray(facts.guidance)).toBe(true)
        expect(facts.guidance.length).toBeGreaterThan(0)
        facts.guidance.forEach(guidance => {
            expect(typeof guidance).toBe('string')
            expect(guidance.length).toBeGreaterThan(0)
        })
    })

    it('edit facts do not leak selection-only fields', () => {
        const facts = getRecipeSpec(MOSAIC).editFacts()

        expect(facts).not.toHaveProperty('useCases')
        expect(facts).not.toHaveProperty('chooseWhen')
        expect(facts).not.toHaveProperty('dontChooseWhen')
    })

    it('edit guidance still covers the documented MOSAIC validation dependencies', () => {
        const guidance = getRecipeSpec(MOSAIC).editFacts().guidance.join('\n')

        expect(guidance).toMatch(/seasonStart/)
        expect(guidance).toMatch(/seasonEnd/)
        expect(guidance).toMatch(/CALIBRATE/)
        expect(guidance).toMatch(/SENTINEL_2/)
        expect(guidance).toMatch(/cloudBuffer/)
    })
})

describe('MOSAIC fact getters — no shared mutable state', () => {

    it('selectionFacts returns a fresh object each call (mutation does not corrupt next caller)', () => {
        const spec = getRecipeSpec(MOSAIC)
        const first = spec.selectionFacts()
        first.description = 'overwritten'
        first.useCases.push('mutation attempt')

        const second = spec.selectionFacts()

        expect(second.description).not.toBe('overwritten')
        expect(second.useCases).not.toContain('mutation attempt')
    })

    it('describeFacts returns a fresh object each call', () => {
        const spec = getRecipeSpec(MOSAIC)
        const first = spec.describeFacts()
        first.description = 'overwritten'

        expect(spec.describeFacts().description).not.toBe('overwritten')
    })

    it('editFacts returns a fresh object each call', () => {
        const spec = getRecipeSpec(MOSAIC)
        const first = spec.editFacts()
        first.guidance.push('mutation attempt')

        expect(spec.editFacts().guidance).not.toContain('mutation attempt')
    })
})

describe('MOSAIC fact getters — byte-size visibility (DESIGN §3 ~15 KB budget)', () => {

    // Visibility only — no assertion.
    it('reports JSON-serialized size per purpose', () => {
        const spec = getRecipeSpec(MOSAIC)
        // eslint-disable-next-line no-console
        console.log(`recipe-facts-size MOSAIC selection=${JSON.stringify(spec.selectionFacts()).length}B describe=${JSON.stringify(spec.describeFacts()).length}B edit=${JSON.stringify(spec.editFacts()).length}B`)
    })
})
