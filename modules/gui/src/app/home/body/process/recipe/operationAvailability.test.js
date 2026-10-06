import {describe, expect, it} from 'vitest'

import {addRecipeType} from '../recipeTypeRegistry'
import {pixelChartAvailability, retrieveAvailability} from './operationAvailability'

addRecipeType({id: 'UNDECLARED', imageSource: true})

describe('operations over a recipe whose type declares no requirements of its sources', () => {
    it('are available with nothing known of its sources, as before requirements were declared', () => {
        const recipe = {id: 'recipe-1', type: 'UNDECLARED', model: {}, ui: {}}
        const state = {process: {loadedRecipes: {[recipe.id]: recipe}}}
        const assessed = {state, recipe, evidenceOwnerOf: () => undefined, now: Date.now()}

        expect(pixelChartAvailability(assessed).available).toBe(true)
        expect(retrieveAvailability(assessed).available).toBe(true)
    })
})
