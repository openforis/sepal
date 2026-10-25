import {Observable} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'

import {addRecipeType} from '../recipeTypeRegistry'
import {pixelChartAvailability, pixelOperationsAvailability, retrieveAvailability, watchOperations} from './operationAvailability'
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

// A CCDC Slice whose export requires something of the source it selects, and of a mask it has no edge for.
addRecipeType({
    id: 'CCDC_SLICE',
    imageSource: true,
    sourceRequirements: [
        {
            id: 'SLICED',
            role: PRIMARY_IMAGE,
            section: {id: 'source', label: 'source'},
            requirement: {capability: {capability: 'SEGMENTS'}},
            operations: [IMAGE_OUTPUT]
        },
        {
            id: 'MASKED',
            role: 'MASK_IMAGE',
            section: {id: 'mask', label: 'mask'},
            requirement: {capability: {capability: 'SEGMENTS'}},
            operations: [IMAGE_OUTPUT]
        }
    ]
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

// What withdraws Retrieve closes an open Retrieve (retrievePanel.jsx); what only holds it leaves it open.
describe('Retrieve over a recipe one requirement of which is found unmet while another is still to be checked', () => {
    it('is withdrawn, naming the section the finding is said in', () => {
        const recipe = {id: 'slice-1', type: 'CCDC_SLICE', model: {source: {type: 'RECIPE_REF', id: 'ccdc-1'}}, ui: {}}
        const state = {process: {loadedRecipes: {[recipe.id]: recipe}}}

        const {available, gate} = retrieveAvailability({state, recipe, evidenceOwnerOf: () => null, heldFor: () => null, now: Date.now()})

        expect(available).toBe(false)
        expect(gate).toMatchObject({withdraw: true, code: 'SOURCE_MISSING', section: 'mask'})
    })
})

// A CCDC Slice's chart reads the segments of the CCDC it selects as that CCDC's own image, over its own AOI
// (#sepal/recipe/type/ccdcSlice). The CCDC's own chart segments at the clicked point instead, reading no AOI
// (pixelObservationsChart.test.jsx).
describe('the segments a CCDC Slice charts of a CCDC whose AOI is a recipe the session does not hold', () => {
    const ccdc = {
        id: 'ccdc-1',
        type: 'CCDC',
        model: {
            aoi: {type: 'RECIPE', id: 'aoi-recipe'},
            dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
            options: {corrections: ['SR']}
        }
    }
    const slice = {id: 'slice-1', type: 'CCDC_SLICE', model: {source: {type: 'RECIPE_REF', id: ccdc.id}}}
    const state = {process: {loadedRecipes: {[slice.id]: slice, [ccdc.id]: ccdc}}}

    it('wait for that AOI, as building the CCDC reads it', () => {
        const {gate} = pixelOperationsAvailability({state, recipe: slice, heldFor: () => null, operations: [PIXEL_SEGMENTS]})

        expect(gate).toMatchObject({wait: true, withdraw: false})
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
