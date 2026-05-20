const {getRecipeSpec, getRecipeUpdateManual} = require('../index')

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
