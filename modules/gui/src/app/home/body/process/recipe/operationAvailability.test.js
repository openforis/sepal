import {Observable} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'

import {addRecipeType} from '../recipeTypeRegistry'
import {pixelChartAvailability, retrieveAvailability, watchOperations} from './operationAvailability'
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

// The chart's action and its open panel each watch what they are held to, so the runtime reads what every operation
// needs - not only the first - for as long as either is there.
describe('watching the operations a chart runs at its pixel', () => {
    it('has the runtime read each operation\'s question until let go', () => {
        const {sourceRuntime, watched} = runtimeRecordingWatches()

        const watches = watchOperations({sourceRuntime, recipeId: 'recipe-1', operations: [PIXEL_OBSERVATIONS, PIXEL_SEGMENTS]})
        expect(watched).toEqual([
            {recipeId: 'recipe-1', operation: PIXEL_OBSERVATIONS},
            {recipeId: 'recipe-1', operation: PIXEL_SEGMENTS}
        ])

        watches.unsubscribe()
        expect(watched).toEqual([])
    })
})

// A runtime whose watched questions are those subscribed and not yet unsubscribed.
const runtimeRecordingWatches = () => {
    const watched = []
    const watchOutput$ = question => new Observable(() => {
        watched.push(question)
        return () => watched.splice(watched.indexOf(question), 1)
    })
    return {sourceRuntime: {watchOutput$}, watched}
}
