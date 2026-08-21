import {describe, expect, it} from 'vitest'

import {recipeTypeMatchesTagFilter} from './createRecipeTagFilter'

// Regression coverage for #340 — Add recipe tag chips must be single-select, not AND multi-select.
describe('recipeTypeMatchesTagFilter', () => {
    const changeAlerts = {id: 'CHANGE_ALERTS', tags: ['CHANGE', 'ALERTS']}
    const opticalMosaic = {id: 'MOSAIC', tags: ['MOSAIC']}
    const asset = {id: 'ASSET', tags: []}
    const untagged = {id: 'UNTAGGED'}
    const allTypes = [changeAlerts, opticalMosaic, asset, untagged]

    const filterTypes = tagFilter =>
        allTypes.filter(type => recipeTypeMatchesTagFilter(type, tagFilter))

    it('shows every recipe when no tag is selected (ALL)', () => {
        expect(recipeTypeMatchesTagFilter(changeAlerts, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(asset, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(untagged, null)).toBe(true)
        expect(filterTypes(null).map(t => t.id)).toEqual(allTypes.map(t => t.id))
    })

    it('matches only recipes that include the selected tag', () => {
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'CHANGE')).toBe(true)
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'ALERTS')).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, 'MOSAIC')).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, 'CHANGE')).toBe(false)
        expect(recipeTypeMatchesTagFilter(asset, 'MOSAIC')).toBe(false)
        expect(recipeTypeMatchesTagFilter(untagged, 'CHANGE')).toBe(false)
        expect(filterTypes('MOSAIC').map(t => t.id)).toEqual(['MOSAIC'])
        expect(filterTypes('CHANGE').map(t => t.id)).toEqual(['CHANGE_ALERTS'])
    })

    it('treats a single selected tag as exclusive (not multi-select AND)', () => {
        // Selecting ALERTS alone must include change-alerts recipes without also
        // requiring CHANGE — multi-select AND filtering was the previous bug mode.
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'ALERTS')).toBe(true)
        expect(recipeTypeMatchesTagFilter({id: 'X', tags: ['CHANGE']}, 'ALERTS')).toBe(false)
        expect(filterTypes('ALERTS').map(t => t.id)).toEqual(['CHANGE_ALERTS'])
    })

    it('handles missing tags safely', () => {
        expect(recipeTypeMatchesTagFilter(null, 'CHANGE')).toBe(false)
        expect(recipeTypeMatchesTagFilter(undefined, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter({id: 'NO_TAGS_KEY'}, 'ALERTS')).toBe(false)
    })
})
