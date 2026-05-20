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

describe('MOSAIC.describeFacts — raw source bands vs derived index outputs', () => {

    const describeOutputs = () => getRecipeSpec(MOSAIC).describeFacts().outputs

    it('mentions NDVI', () => {
        expect(describeOutputs()).toMatch(/NDVI/)
    })

    it('states NDVI is a derived index, not a raw source band', () => {
        const outputs = describeOutputs()

        expect(outputs).toMatch(/derived index/i)
        expect(outputs).toMatch(/not a raw source band/i)
    })

    it('says NDVI is available when red + NIR are present', () => {
        expect(describeOutputs()).toMatch(/red\s*\+\s*nir/i)
    })

    it('describes raw source bands and derived index outputs as separate categories', () => {
        const outputs = describeOutputs()

        expect(outputs).toMatch(/raw source bands/i)
        expect(outputs).toMatch(/derived index outputs/i)

        // The raw-source-band line lists reflectance bands and must NOT list ndvi —
        // conflating the two is exactly the failure this slice fixes.
        const rawLine = outputs.split('\n').find(line => /raw source bands/i.test(line) && /blue/i.test(line))
        expect(rawLine).toBeDefined()
        expect(rawLine).not.toMatch(/ndvi/i)
    })

    it('lists the common supported derived indexes', () => {
        const outputs = describeOutputs()

        for (const index of ['NDVI', 'NDMI', 'NDWI', 'MNDWI', 'NDFI', 'EVI', 'EVI2', 'SAVI', 'NBR', 'MVI', 'UI', 'NDBI', 'IBI', 'NBI', 'EBBI', 'BUI', 'KNDVI']) {
            expect(outputs).toContain(index)
        }
    })

    it('marks the current map visualization as separate GUI/map context, not the recipe model', () => {
        const outputs = describeOutputs()

        expect(outputs).toMatch(/map/i)
        expect(outputs).toMatch(/not part of the recipe model/i)
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
