import {getRecipeSpec, getRecipeUpdateManual} from '../index.js'

const MOSAIC = 'MOSAIC'

describe('MOSAIC.updateManual — compact path-first update manual', () => {

    function manual() {
        return getRecipeSpec(MOSAIC).updateManual()
    }

    function rule(name) {
        return getRecipeSpec(MOSAIC).rules.find(r => r.name === name)
    }

    describe('canonical model-relative paths', () => {

        it('lists representative editable paths across the recipe sections', () => {
            const text = manual()

            expect(text).toContain('/dates/targetDate')
            expect(text).toContain('/dates/seasonStart')
            expect(text).toContain('/sources/dataSets')
            expect(text).toContain('/sceneSelectionOptions/type')
            expect(text).toContain('/compositeOptions/corrections')
            expect(text).toContain('/compositeOptions/tileOverlap')
            expect(text).toContain('/compositeOptions/compose')
        })
    })

    describe('value/range/type hints', () => {

        it('surfaces enum values for the tile-overlap field', () => {
            expect(manual()).toContain('QUICK_REMOVE')
        })

        it('surfaces enum values for the compose field', () => {
            expect(manual()).toContain('MEDOID')
        })

        it('pairs enum values with user-facing labels', () => {
            const text = manual()

            expect(text).toContain('AGGRESSIVE(aggressive)')
            expect(text).toContain('landsatCFMask(Landsat CFMask)')
            expect(text).toContain('SENTINEL_2(Sentinel-2)')
            expect(text).toContain('MEDOID(medoid)')
        })

        it('surfaces the integer bounds for the surrounding-years field', () => {
            const text = manual()

            expect(text).toContain('/dates/yearsBefore')
            expect(text).toMatch(/\b0\b/)
            expect(text).toMatch(/\b25\b/)
        })

        it('surfaces a type/format hint for a date field', () => {
            const datesSection = manual().slice(manual().indexOf('/dates/targetDate'))

            expect(datesSection).toMatch(/date|YYYY-MM-DD/i)
        })
    })

    describe('rule-derived constraints', () => {

        it('names a date-window constraint and carries its description verbatim', () => {
            const text = manual()

            expect(text).toContain('seasonStartWindow')
            expect(text).toContain(rule('seasonStartWindow').description)
        })

        it('names the multiple-sources scene-selection constraint and carries its description verbatim', () => {
            const text = manual()

            expect(text).toContain('multipleSourcesRequireAllScenes')
            expect(text).toContain(rule('multipleSourcesRequireAllScenes').description)
        })
    })

    describe('schema-derived conditional requirements', () => {

        function constraintsSection() {
            return manual().slice(manual().indexOf('Constraints:'))
        }

        it('surfaces the BRDF -> brdfMultiplier requirement', () => {
            expect(constraintsSection()).toContain('brdfMultiplier')
        })

        it.each([
            'sentinel2CloudProbabilityMaxCloudProbability',
            'sentinel2CloudScorePlusBand',
            'sentinel2CloudScorePlusMaxCloudProbability',
            'landsatCFMaskCloudMasking',
            'sepalCloudScoreMaxCloudProbability'
        ])('surfaces the cloud-masking method companion %s', companion => {
            expect(constraintsSection()).toContain(companion)
        })
    })

    describe('field guidance', () => {

        // Each curated path is paired with a representative guidance marker that
        // pins the INTENT of the corrected EE performance/quality fact, not its
        // wording. The assertion proves both the path AND a performance-flavoured
        // phrase surface in the manual — markers, not verbatim sentences.
        const SPEED_GUIDANCE = [
            ['/compositeOptions/tileOverlap', /(QUICK_REMOVE|memory|Sentinel-2|S2)/i],
            ['/compositeOptions/cloudBuffer', /(expensive|distance|buffer|cost|mask)/i],
            ['/compositeOptions/compose', /(MEDOID|MEDIAN).*(median|qualityMosaic|cheaper|extra)/i],
            ['/compositeOptions/includedCloudMasking', /(combined|per-image|one .*operation|volume)/i],
            ['/sources/dataSets', /(source|candidate scene|observation|volume|processing)/i],
            ['/dates/yearsBefore', /(wider|tight|window).*(scene|processing|speed|fast)/i]
        ]

        it.each(SPEED_GUIDANCE)('carries performance/speed guidance for %s', (path, guidance) => {
            const text = manual()

            expect(text).toContain(path)
            expect(text).toMatch(guidance)
        })

        it('no longer claims fewer cloud-masking methods are faster', () => {
            const guidanceText = manual().slice(
                manual().indexOf('Field guidance:'),
                manual().indexOf('Constraints:'))

            expect(guidanceText).not.toMatch(/fewer.*method.*fast|fewer.*method.*speed/i)
        })

        it('states at least one explicit speed/quality tradeoff', () => {
            expect(manual()).toMatch(/(tradeoff|artifact|cleaner|quality|more complete).*(fast|faster|fastest|speed|processing|cost|memory)|(fast|faster|fastest|speed|processing|cost|memory).*(tradeoff|artifact|cleaner|quality|more complete)/i)
        })
    })

    describe('purpose rendered distinctly before guidance', () => {

        // The manual separates WHAT a field controls (Purpose) from how to tune
        // it (Guidance). Locate the fact's guidance entry by shape — the line
        // carrying both the path and a Purpose label — so the assertion is
        // independent of where the field-guidance section sits in the manual.
        function entryFor(path) {
            return manual().split('\n').find(line => line.includes(path) && line.includes('Purpose:'))
        }

        it('labels the field purpose', () => {
            expect(manual()).toMatch(/Purpose:/)
        })

        it('renders Purpose before Guidance within a field entry', () => {
            const entry = entryFor('/compositeOptions/cloudBuffer')

            expect(entry).toMatch(/Purpose:.*Guidance:/)
        })

        it('carries the field-descriptive purpose text in the entry', () => {
            const entry = entryFor('/compositeOptions/cloudBuffer')
            const purposePart = entry.slice(entry.indexOf('Purpose:'), entry.indexOf('Guidance:'))

            expect(purposePart).toMatch(/buffer/i)
        })
    })

    describe('warnings section', () => {

        function warningsSection() {
            const text = manual()
            const start = text.indexOf('Warnings:')
            const after = text.indexOf('Constraints:', start)
            return after === -1 ? text.slice(start) : text.slice(start, after)
        }

        it('renders a distinct Warnings section', () => {
            expect(manual()).toMatch(/Warnings:/)
        })

        it('keeps purpose and guidance out of the warnings section', () => {
            const warnings = warningsSection()

            expect(warnings).not.toMatch(/Purpose:/)
            expect(warnings).not.toMatch(/Guidance:/)
        })

        it('surfaces the cloudBuffer expense warning', () => {
            const warnings = warningsSection()

            expect(warnings).toMatch(/cloudBuffer/)
            expect(warnings).toMatch(/expensive|distance|buffer/i)
        })

        it('surfaces the BRDF expense warning', () => {
            const warnings = warningsSection()

            expect(warnings).toMatch(/BRDF/)
            expect(warnings).toMatch(/expensive|slow|fail/i)
        })

        it('surfaces the per-filter cost warning', () => {
            const warnings = warningsSection()

            expect(warnings).toMatch(/filter/i)
            expect(warnings).toMatch(/cost/i)
        })
    })

    describe('determinism (cacheable)', () => {

        it('produces a byte-identical string across calls', () => {
            expect(getRecipeSpec(MOSAIC).updateManual()).toEqual(getRecipeSpec(MOSAIC).updateManual())
        })
    })
})

describe('getRecipeUpdateManual registry helper', () => {

    it('delegates to the spec for a known id', () => {
        expect(getRecipeUpdateManual(MOSAIC)).toEqual(getRecipeSpec(MOSAIC).updateManual())
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeUpdateManual('UNKNOWN')).toBeNull()
    })
})
