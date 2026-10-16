import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The band a Time Series provides, from its persisted model alone, through the real Time Series, Masking and Stack
// declarations and the common read. Band names and policies are literals.

const COUNT = {name: 'count', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}

describe('a Time Series', () => {
    for (const [scenario, sources] of [
        ['optical sources', {dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}}],
        ['radar sources', {dataSets: {SENTINEL_1: ['SENTINEL_1']}}],
        ['Planet sources', {dataSets: {PLANET: ['BASEMAPS']}}],
        ['a classification beside its imagery', {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: 'classification-1'}]
    ]) {
        it(`over ${scenario} provides its count alone, averaged`, () => {
            const {status, description} = read(timeSeries({sources}))

            assert.equal(status, 'READY')
            assert.deepEqual(description.output.bands, [COUNT])
        })
    }

    it('is described while the recipe its AOI comes from is not even loaded', () => {
        const result = read(timeSeries({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.needs, {records: [], observations: []})
    })

    it('is described before anything is configured', () => {
        const result = read({id: 'time-series-1', type: 'TIME_SERIES', model: {}})

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.description.output.bands, [COUNT])
    })
})

describe('a recipe over a Time Series', () => {
    const counted = timeSeries()

    it('keeps its count and policy through a Masking', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: counted.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}}

        assert.deepEqual(read(masking, [counted]).description.output.bands, [COUNT])
    })

    it('keeps its policy under the name a Stack gives', () => {
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: counted.id}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [{id: 'b1', originalName: 'count', outputName: 'observations'}]}]}
            }
        }

        assert.deepEqual(
            read(stack, [counted]).description.output.bands,
            [{...COUNT, name: 'observations'}]
        )
    })
})

function timeSeries({aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, sources = {dataSets: {LANDSAT: ['LANDSAT_8']}}} = {}) {
    return {
        id: 'time-series-1',
        type: 'TIME_SERIES',
        model: {aoi, dates: {startDate: '2023-01-01', endDate: '2024-01-01'}, sources, options: {corrections: []}}
    }
}

const read = (recipe, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({
        rootRecipe: recipe,
        recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: () => undefined
})
