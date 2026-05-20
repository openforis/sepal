const {getRecipeSpec, getRecipeKnowledge} = require('../index')

const MOSAIC = 'MOSAIC'

// The knowledge list is the reusable source of truth that BOTH the update
// manual (now) and a future troubleshooting/advice specialist (filtering by
// topic/inspectWhen) consume. These tests pin its STRUCTURE and selection
// markers directly, not via the rendered manual — so the artifact stays usable
// by a second generator. Assert shape + topic/path markers, never verbatim
// guidance wording.
describe('MOSAIC.knowledge — curated reusable recipe facts', () => {

    function facts() {
        return getRecipeSpec(MOSAIC).knowledge()
    }

    function pathsOf(fact) {
        return fact.paths || (fact.path ? [fact.path] : [])
    }

    function factFor(path) {
        return facts().find(fact => pathsOf(fact).includes(path))
    }

    describe('fact structure', () => {

        it('is a non-empty list', () => {
            expect(facts().length).toBeGreaterThan(0)
        })

        it('every fact tags topics, carries guidance, and addresses at least one path', () => {
            facts().forEach(fact => {
                expect(Array.isArray(fact.topics)).toBe(true)
                expect(fact.guidance.length).toBeGreaterThan(0)
                expect(pathsOf(fact).length).toBeGreaterThan(0)
            })
        })
    })

    describe('topic tagging for later selection', () => {

        it.each([
            '/compositeOptions/cloudBuffer',
            '/compositeOptions/tileOverlap'
        ])('tags %s with the performance topic', path => {
            expect(factFor(path).topics).toContain('performance')
        })
    })

    describe('reusability for a future troubleshooting specialist', () => {

        it('carries inspectWhen on at least one fact', () => {
            const hasInspectWhen = facts().some(fact =>
                Array.isArray(fact.inspectWhen) && fact.inspectWhen.length > 0)
            expect(hasInspectWhen).toBe(true)
        })

        it('models the source/correction interaction as a single multi-path fact', () => {
            const interaction = facts().find(fact =>
                pathsOf(fact).includes('/sources/dataSets') &&
                pathsOf(fact).includes('/compositeOptions/corrections') &&
                pathsOf(fact).includes('/sceneSelectionOptions/type'))
            expect(interaction).toBeDefined()
        })
    })

    describe('corrected EE performance/quality model', () => {

        function guidanceOf(path) {
            return factFor(path).guidance.join(' ')
        }

        function warningsOf(path) {
            return (factFor(path).warnings || []).join(' ')
        }

        it('warns that cloudBuffer > 0 is expensive (distance-transform / buffering)', () => {
            const fact = factFor('/compositeOptions/cloudBuffer')

            expect(Array.isArray(fact.warnings)).toBe(true)
            expect(fact.warnings.length).toBeGreaterThan(0)
            expect(warningsOf('/compositeOptions/cloudBuffer')).toMatch(/expensive|distance|buffer/i)
        })

        it('warns that BRDF is expensive and a render-reliability lever', () => {
            const brdfWarning = facts()
                .flatMap(fact => fact.warnings || [])
                .find(warning => /BRDF/.test(warning) && /expensive|slow|fail|reliab/i.test(warning))

            expect(brdfWarning).toBeDefined()
        })

        it('models filters as collection-level cost (each filter adds map/reduce/masking work)', () => {
            const fact = factFor('/compositeOptions/filters')

            expect(fact).toBeDefined()
            const text = [...fact.guidance, ...(fact.warnings || [])].join(' ')
            expect(text).toMatch(/filter/i)
            expect(text).toMatch(/cost|map|reduction|reduce|mask/i)
            expect(text).toMatch(/active filter/i)
        })

        it('models includedCloudMasking as one combined per-image operation, not a method-count speed lever', () => {
            const guidance = guidanceOf('/compositeOptions/includedCloudMasking')

            expect(guidance).toMatch(/combined|one .*operation|per-image/i)
            expect(guidance).toMatch(/ancillary collection|source availability/i)
            expect(guidance).not.toMatch(/fewer.*method.*fast|fewer.*method.*speed/i)
            expect(guidance).not.toMatch(/Real cost drivers/i)
        })

        it('models tileOverlap as Sentinel-2-only with QUICK_REMOVE default and KEEP increasing memory', () => {
            const guidance = guidanceOf('/compositeOptions/tileOverlap')

            expect(guidance).toMatch(/Sentinel-2|S2/i)
            expect(guidance).toMatch(/QUICK_REMOVE/)
            expect(guidance).toMatch(/memory|latency/i)
            expect(guidance).not.toMatch(/KEEP.*fast/i)
        })

        it('models overlap removal as workload-dependent processing/memory work, not a direct quality lever', () => {
            const overlapFacts = [
                factFor('/compositeOptions/tileOverlap'),
                factFor('/compositeOptions/orbitOverlap')
            ]
            const overlapText = overlapFacts
                .flatMap(fact => [...fact.guidance, ...(fact.tradeoffs || [])])
                .join(' ')

            expect(overlapText).toMatch(/CCDC|time-series/i)
            expect(overlapText).toMatch(/workload-dependent|difficult to know|preprocessing|observation volume/i)
            expect(overlapText).toMatch(/No direct quality win\/loss/i)
            expect(overlapText).not.toMatch(/BRDF|look-angle/i)
        })

        it('models compose as MEDOID expensive and MEDIAN cheaper', () => {
            const guidance = guidanceOf('/compositeOptions/compose')

            expect(guidance).toMatch(/MEDIAN.*(cheaper|direct)/i)
            expect(guidance).toMatch(/MEDOID.*(median|distance|qualityMosaic|extra)/i)
        })

        it('models candidate scene volume as a failure/reliability driver', () => {
            const fact = factFor('/sources/cloudPercentageThreshold')
            const paths = pathsOf(fact)
            const text = fact.guidance.join(' ')

            expect(paths).toEqual(expect.arrayContaining([
                '/dates/seasonStart',
                '/dates/seasonEnd',
                '/dates/yearsBefore',
                '/dates/yearsAfter',
                '/sources/cloudPercentageThreshold',
                '/sources/dataSets'
            ]))
            expect(text).toMatch(/candidate scene|memory|latency|render failure/i)
            expect(text).toMatch(/cloudPercentageThreshold/i)
        })

        it('models snowMasking as keep-on-by-default because clouds can be misread as snow', () => {
            const guidance = guidanceOf('/compositeOptions/snowMasking')

            expect(guidance).toMatch(/snow/i)
            expect(guidance).toMatch(/cloud|default|on/i)
        })

        it('records the Sentinel-2 SR availability caveat (2017-2018 not globally covered)', () => {
            const availability = facts().find(fact =>
                pathsOf(fact).includes('/dates/targetDate') &&
                fact.guidance.join(' ').match(/2017|2018|coverage|availab/i))

            expect(availability).toBeDefined()
        })

        it('prioritizes failed-rendering triggers for performance-sensitive facts', () => {
            const failurePaths = [
                '/compositeOptions/cloudBuffer',
                '/compositeOptions/filters',
                '/compositeOptions/compose',
                '/sources/cloudPercentageThreshold'
            ]

            failurePaths.forEach(path => {
                expect(factFor(path).inspectWhen).toEqual(expect.arrayContaining([
                    'Render fails',
                    'Earth Engine memory error'
                ]))
            })
        })
    })

    describe('fresh / deterministic (cacheable)', () => {

        it('returns deeply-equal lists across calls', () => {
            expect(getRecipeSpec(MOSAIC).knowledge()).toEqual(getRecipeSpec(MOSAIC).knowledge())
        })

        it('returns fresh objects — mutating one fact does not leak into the next call', () => {
            const first = getRecipeSpec(MOSAIC).knowledge()
            first[0].guidance.push('injected guidance')
            first[0].topics.push('injected-topic')

            const second = getRecipeSpec(MOSAIC).knowledge()
            expect(second[0].guidance).not.toContain('injected guidance')
            expect(second[0].topics).not.toContain('injected-topic')
        })

        it('returns fresh warnings arrays — mutating one does not leak into the next call', () => {
            const withWarnings = getRecipeSpec(MOSAIC).knowledge().find(fact => Array.isArray(fact.warnings))
            const index = getRecipeSpec(MOSAIC).knowledge().findIndex(fact => Array.isArray(fact.warnings))
            withWarnings.warnings.push('injected warning')

            const second = getRecipeSpec(MOSAIC).knowledge()
            expect(second[index].warnings).not.toContain('injected warning')
        })
    })
})

describe('getRecipeKnowledge registry helper', () => {

    it('delegates to the spec for a known id', () => {
        expect(getRecipeKnowledge(MOSAIC)).toEqual(getRecipeSpec(MOSAIC).knowledge())
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeKnowledge('UNKNOWN')).toBeNull()
    })
})
