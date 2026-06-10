import {getRecipeLlmMetadata, getRecipeSpec} from '../index.js'

const MOSAIC = 'MOSAIC'

describe('MOSAIC.llmMetadata — date-window constraints', () => {

    function constraints() {
        return getRecipeSpec(MOSAIC).llmMetadata().constraints
    }

    function constraint(name) {
        return constraints().find(c => c.name === name)
    }

    it('couples targetDate and seasonStart under seasonStartWindow', () => {
        expect(constraint('seasonStartWindow').paths.sort()).toEqual([
            '/dates/seasonStart',
            '/dates/targetDate'
        ])
    })

    it('couples targetDate and seasonEnd under seasonEndWindow', () => {
        expect(constraint('seasonEndWindow').paths.sort()).toEqual([
            '/dates/seasonEnd',
            '/dates/targetDate'
        ])
    })

    it('does not reference yearsBefore/yearsAfter in any constraint', () => {
        const paths = constraints().flatMap(c => c.paths)
        expect(paths).not.toContain('/dates/yearsBefore')
        expect(paths).not.toContain('/dates/yearsAfter')
    })

    it('names each rule-derived constraint after the rule that enforces it', () => {
        const ruleNames = getRecipeSpec(MOSAIC).rules.map(rule => rule.name)
        const ruleDerived = constraints().filter(c => !c.name.startsWith('schema:'))

        ruleDerived.forEach(c => expect(ruleNames).toContain(c.name))
    })

    it('derives each constraint description verbatim from the rule it is named after', () => {
        const rule = name => getRecipeSpec(MOSAIC).rules.find(r => r.name === name)
        expect(constraint('seasonStartWindow').description).toEqual(rule('seasonStartWindow').description)
        expect(constraint('seasonEndWindow').description).toEqual(rule('seasonEndWindow').description)
    })
})

describe('MOSAIC.llmMetadata — generated from validation rules', () => {

    function constraints() {
        return getRecipeSpec(MOSAIC).llmMetadata().constraints
    }

    function constraint(name) {
        return constraints().find(c => c.name === name)
    }

    function couples(c, a, b) {
        return c.paths.includes(a) && c.paths.includes(b)
    }

    it('couples sources.dataSets with compositeOptions.corrections through some constraint', () => {
        const coupled = constraints().some(c => couples(c, '/sources/dataSets', '/compositeOptions/corrections'))
        expect(coupled).toBe(true)
    })

    it('couples sources.dataSets with sceneSelectionOptions.type through some constraint', () => {
        const coupled = constraints().some(c => couples(c, '/sources/dataSets', '/sceneSelectionOptions/type'))
        expect(coupled).toBe(true)
    })

    it('never references the surrounding-years span in any constraint', () => {
        const paths = constraints().flatMap(c => c.paths)
        expect(paths).not.toContain('/dates/yearsBefore')
        expect(paths).not.toContain('/dates/yearsAfter')
    })

    it('returns fresh objects each call — mutating one packet does not leak into the next', () => {
        const first = getRecipeLlmMetadata(MOSAIC)
        first.constraints.push({name: 'injected', paths: ['/dates/targetDate']})
        first.constraints[0].paths.push('/injected/path')

        const second = getRecipeLlmMetadata(MOSAIC)
        expect(second.constraints.some(c => c.name === 'injected')).toBe(false)
        expect(second.constraints[0].paths).not.toContain('/injected/path')
    })
})

describe('MOSAIC.llmMetadata — schema-derived conditional requirements', () => {

    function constraints() {
        return getRecipeSpec(MOSAIC).llmMetadata().constraints
    }

    function couples(c, a, b) {
        return c.paths.includes(a) && c.paths.includes(b)
    }

    function coupledWithIncludedCloudMasking(companion) {
        return constraints().some(c => couples(c, '/compositeOptions/includedCloudMasking', companion))
    }

    it('couples corrections=BRDF with the required brdfMultiplier', () => {
        const coupled = constraints().some(c => couples(c, '/compositeOptions/corrections', '/compositeOptions/brdfMultiplier'))

        expect(coupled).toBe(true)
    })

    it.each([
        '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability',
        '/compositeOptions/sentinel2CloudScorePlusBand',
        '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability',
        '/compositeOptions/landsatCFMaskCloudMasking',
        '/compositeOptions/landsatCFMaskCloudShadowMasking',
        '/compositeOptions/landsatCFMaskCirrusMasking',
        '/compositeOptions/landsatCFMaskDilatedCloud',
        '/compositeOptions/sepalCloudScoreMaxCloudProbability'
    ])('couples includedCloudMasking with the schema-required companion %s', companion => {
        expect(coupledWithIncludedCloudMasking(companion)).toBe(true)
    })

    it('marks schema-derived constraints with a schema: name prefix so their origin is clear', () => {
        const schemaDerived = constraints().filter(c => c.name.startsWith('schema:'))

        expect(schemaDerived.length).toBeGreaterThan(0)
        schemaDerived.forEach(c => expect(c.description).toMatch(/requires/))
    })
})

describe('getRecipeLlmMetadata registry helper', () => {

    it('delegates to the spec for a known id', () => {
        expect(getRecipeLlmMetadata(MOSAIC)).toEqual(getRecipeSpec(MOSAIC).llmMetadata())
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeLlmMetadata('UNKNOWN')).toBeNull()
    })
})
