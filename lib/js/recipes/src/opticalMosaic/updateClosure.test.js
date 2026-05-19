const {getRecipeSpec, getRecipeUpdateClosure} = require('../index')

const MOSAIC = 'MOSAIC'

function aMosaicEffectiveModel(overrides = {}) {
    return {
        dates: {
            type: 'YEARLY_TIME_SCAN',
            targetDate: '2024-07-02',
            seasonStart: '2024-01-01',
            seasonEnd: '2025-01-01',
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
        },
        sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
        compositeOptions: {corrections: ['SR', 'BRDF']},
        aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]},
        ...overrides
    }
}

describe('MOSAIC.updateClosure — target-date intent', () => {

    function dateClosure(extra = {}) {
        return getRecipeSpec(MOSAIC).updateClosure({
            instruction: 'change the target date to 2026-06-01',
            effectiveModel: aMosaicEffectiveModel(),
            ...extra
        })
    }

    it('classifies the intent as date-window', () => {
        expect(dateClosure().intent).toBe('dateWindow')
    })

    it('returns current /dates values from the effective model', () => {
        const closure = dateClosure()

        expect(closure.currentValues).toEqual({
            '/dates/targetDate': '2024-07-02',
            '/dates/seasonStart': '2024-01-01',
            '/dates/seasonEnd': '2025-01-01',
            '/dates/yearsBefore': 0,
            '/dates/yearsAfter': 0
        })
    })

    it('lists the dependent paths (targetDate + season window + yearsBefore/yearsAfter)', () => {
        expect(dateClosure().dependentPaths.sort()).toEqual([
            '/dates/seasonEnd',
            '/dates/seasonStart',
            '/dates/targetDate',
            '/dates/yearsAfter',
            '/dates/yearsBefore'
        ])
    })

    it('includes the seasonStart / seasonEnd window rules in guidance', () => {
        const guidance = dateClosure().guidance.join('\n')

        expect(guidance).toMatch(/seasonStart.*targetDate - 1y \+ 1d.*targetDate/)
        expect(guidance).toMatch(/seasonEnd.*targetDate \+ 1d.*targetDate \+ 1y/)
    })

    it('includes the default annual scan suggestion (seasonStart=YYYY-01-01, seasonEnd=(YYYY+1)-01-01, yearsBefore=0, yearsAfter=0)', () => {
        const guidance = dateClosure().guidance.join('\n')

        expect(guidance).toMatch(/YYYY-01-01/)
        expect(guidance).toMatch(/\(YYYY\+1\)-01-01/)
        expect(guidance).toMatch(/yearsBefore=0/)
        expect(guidance).toMatch(/yearsAfter=0/)
    })

    it('classifies "set targetDate to ..." (path-form mention) as date-window intent', () => {
        const closure = getRecipeSpec(MOSAIC).updateClosure({
            instruction: 'set /dates/targetDate to 2026-06-01',
            effectiveModel: aMosaicEffectiveModel()
        })

        expect(closure.intent).toBe('dateWindow')
    })

    it('classifies "change the season window" as date-window intent', () => {
        const closure = getRecipeSpec(MOSAIC).updateClosure({
            instruction: 'change the season window to start in March',
            effectiveModel: aMosaicEffectiveModel()
        })

        expect(closure.intent).toBe('dateWindow')
    })
})

describe('MOSAIC.updateClosure — broad fallback', () => {

    function broadClosure(instruction = 'make the recipe better') {
        return getRecipeSpec(MOSAIC).updateClosure({
            instruction,
            effectiveModel: aMosaicEffectiveModel()
        })
    }

    it("marks the closure intent as 'broad' when the instruction does not match a deterministic intent", () => {
        expect(broadClosure().intent).toBe('broad')
    })

    it('returns the full editFacts guidance so the specialist sees every dependency rule', () => {
        const closure = broadClosure()

        const editFactsGuidance = getRecipeSpec(MOSAIC).editFacts().guidance
        expect(closure.guidance).toEqual(editFactsGuidance)
    })

    it("returns the top-level effective sections as currentValues so the specialist can locate fields without a second load", () => {
        const closure = broadClosure()

        expect(Object.keys(closure.currentValues).sort()).toEqual([
            '/aoi', '/compositeOptions', '/dates', '/sceneSelectionOptions', '/sources'
        ])
    })

    it("returns an empty dependentPaths array (broad scope — any path is allowed; the LLM must narrow using guidance, not blanket replace root)", () => {
        expect(broadClosure().dependentPaths).toEqual([])
    })
})

describe('MOSAIC.updateClosure — mutation safety', () => {

    it('does not mutate the supplied effectiveModel', () => {
        const model = aMosaicEffectiveModel()
        const before = JSON.stringify(model)

        getRecipeSpec(MOSAIC).updateClosure({instruction: 'change the target date', effectiveModel: model})

        expect(JSON.stringify(model)).toBe(before)
    })

    it('returns a fresh object so consumers can mutate without corrupting the next caller', () => {
        const spec = getRecipeSpec(MOSAIC)
        const first = spec.updateClosure({instruction: 'change the target date', effectiveModel: aMosaicEffectiveModel()})
        first.guidance.push('mutation attempt')

        const second = spec.updateClosure({instruction: 'change the target date', effectiveModel: aMosaicEffectiveModel()})

        expect(second.guidance).not.toContain('mutation attempt')
    })
})

describe('getRecipeUpdateClosure registry helper', () => {

    it('delegates to the spec for a known id', () => {
        const args = {instruction: 'change the target date', effectiveModel: aMosaicEffectiveModel()}

        expect(getRecipeUpdateClosure(MOSAIC, args)).toEqual(getRecipeSpec(MOSAIC).updateClosure(args))
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeUpdateClosure('UNKNOWN', {instruction: 'x', effectiveModel: {}})).toBeNull()
    })
})
