import {describe, expect, it, vi} from 'vitest'

import {addRecipeType} from '../recipeTypeRegistry'
import {pixelChartAvailability, retrieveAvailability} from './operationAvailability'
import {PIXEL_SEGMENTS} from './sourceRequirements'

addRecipeType({id: 'UNDECLARED', imageSource: true})
// A type whose segment chart requires something of the source selected for one role.
addRecipeType({
    id: 'CHARTED',
    imageSource: true,
    sourceRequirements: [{
        id: 'CHARTABLE',
        role: 'PRIMARY_IMAGE',
        section: {id: 'reference', label: 'reference'},
        requirement: {capability: {capability: 'SEGMENTS'}},
        operations: [PIXEL_SEGMENTS]
    }]
})

describe('operations over a recipe whose type declares no requirements of its sources', () => {
    it('are available with nothing known of its sources, as before requirements were declared', () => {
        const recipe = {id: 'recipe-1', type: 'UNDECLARED', model: {}, ui: {}}
        const state = {process: {loadedRecipes: {[recipe.id]: recipe}}}
        const assessed = {state, recipe, evidenceOwnerOf: () => undefined, now: Date.now()}

        expect(pixelChartAvailability(assessed).available).toBe(true)
        expect(retrieveAvailability(assessed).available).toBe(true)
    })
})

describe('the segment chart over a recipe whose type requires something of its source', () => {
    it('reads the recipe\'s requirements once to judge both whether it may start and what it can plot', () => {
        const recipe = {id: 'recipe-1', type: 'CHARTED', model: {}, ui: {}}
        const state = {process: {loadedRecipes: {[recipe.id]: recipe}}}
        const evidenceOwnerOf = vi.fn(() => null)

        const chart = pixelChartAvailability({state, recipe, evidenceOwnerOf, heldFor: () => null, now: Date.now()})

        expect(chart.available).toBe(false)
        expect(chart.chartable).toBe(null)
        expect(evidenceOwnerOf).toHaveBeenCalledTimes(1)
    })
})
