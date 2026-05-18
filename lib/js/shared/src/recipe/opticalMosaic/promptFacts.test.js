const {getRecipeSpec} = require('../index')

const MOSAIC = 'MOSAIC'

describe('MOSAIC.promptFacts — shape', () => {

    it('exposes the five documented fields: description, useCases, chooseWhen, dontChooseWhen, outputs', () => {
        const facts = getRecipeSpec(MOSAIC).promptFacts()

        expect(Object.keys(facts).sort()).toEqual([
            'chooseWhen', 'description', 'dontChooseWhen', 'outputs', 'useCases'
        ])
    })

    it('returns non-empty strings for description / chooseWhen / dontChooseWhen / outputs', () => {
        const facts = getRecipeSpec(MOSAIC).promptFacts()

        for (const field of ['description', 'chooseWhen', 'dontChooseWhen', 'outputs']) {
            expect(typeof facts[field]).toBe('string')
            expect(facts[field].length).toBeGreaterThan(0)
        }
    })

    it('returns useCases as a non-empty array of non-empty strings', () => {
        const facts = getRecipeSpec(MOSAIC).promptFacts()

        expect(Array.isArray(facts.useCases)).toBe(true)
        expect(facts.useCases.length).toBeGreaterThan(0)
        facts.useCases.forEach(useCase => {
            expect(typeof useCase).toBe('string')
            expect(useCase.length).toBeGreaterThan(0)
        })
    })
})

describe('MOSAIC.promptFacts — no shared mutable state', () => {

    it('two consecutive calls return deep-equal objects (not a shared mutable singleton)', () => {
        const spec = getRecipeSpec(MOSAIC)

        const a = spec.promptFacts()
        const b = spec.promptFacts()

        expect(a).toEqual(b)
    })

    it('mutating the returned facts does not corrupt the next caller', () => {
        const spec = getRecipeSpec(MOSAIC)
        const first = spec.promptFacts()
        first.useCases.push('mutation attempt')
        first.description = 'overwritten'

        const second = spec.promptFacts()

        expect(second.description).not.toBe('overwritten')
        expect(second.useCases).not.toContain('mutation attempt')
    })
})

describe('MOSAIC.promptFacts — byte-size visibility (DESIGN §3 ~15 KB budget)', () => {

    // Visibility only — no assertion.
    it('reports JSON-serialized size', () => {
        const bytes = JSON.stringify(getRecipeSpec(MOSAIC).promptFacts()).length
        // eslint-disable-next-line no-console
        console.log(`recipe-promptFacts-size MOSAIC ${bytes}B`)
    })
})
