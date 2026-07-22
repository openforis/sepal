import {describe, expect, it} from 'vitest'

import {recipeTypeMatchesTagFilter} from './createRecipeTagFilter'

describe('recipeTypeMatchesTagFilter', () => {
    const changeAlerts = {id: 'CHANGE_ALERTS', tags: ['CHANGE', 'ALERTS']}
    const opticalMosaic = {id: 'MOSAIC', tags: ['MOSAIC']}
    const asset = {id: 'ASSET', tags: []}
    const untagged = {id: 'UNTAGGED'}

    it('shows every recipe when no tag is selected (ALL)', () => {
        expect(recipeTypeMatchesTagFilter(changeAlerts, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(asset, null)).toBe(true)
        expect(recipeTypeMatchesTagFilter(untagged, null)).toBe(true)
    })

    it('matches only recipes that include the selected tag', () => {
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'CHANGE')).toBe(true)
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'ALERTS')).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, 'MOSAIC')).toBe(true)
        expect(recipeTypeMatchesTagFilter(opticalMosaic, 'CHANGE')).toBe(false)
        expect(recipeTypeMatchesTagFilter(asset, 'MOSAIC')).toBe(false)
        expect(recipeTypeMatchesTagFilter(untagged, 'CHANGE')).toBe(false)
    })

    it('treats a single selected tag as exclusive (not multi-select AND)', () => {
        // Selecting ALERTS alone must include change-alerts recipes without also
        // requiring CHANGE — multi-select AND filtering was the previous bug mode.
        expect(recipeTypeMatchesTagFilter(changeAlerts, 'ALERTS')).toBe(true)
        expect(recipeTypeMatchesTagFilter({id: 'X', tags: ['CHANGE']}, 'ALERTS')).toBe(false)
    })
})
