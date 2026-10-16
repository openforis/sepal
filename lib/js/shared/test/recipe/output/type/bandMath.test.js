import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands a Band Math recipe provides: the output bands it is configured with, named and ordered as configured,
// with the dimensionality its running image is observed to have. A cast sets only the element type, and whether an
// expression or reducer yields an array depends on its inputs, so only an observation establishes it. Statuses,
// codes and persisted field names are literals.

describe('a Band Math recipe with its running image observed', () => {
    it('provides its configured output bands in configured order, under their output names', () => {
        const {status, description} = read(bandMath(), {observed: [scalar('dem2'), scalar('elevation'), scalar('mean')]})

        assert.equal(status, 'READY')
        assert.deepEqual(description.executionReference, {type: 'RECIPE_REF', id: 'band-math-1'})
        assert.deepEqual(
            description.output.bands.map(({name}) => name),
            ['dem2', 'elevation', 'mean']
        )
        assert.deepEqual(description.evidence, [])
    })

    it('averages a verified scalar and samples a verified array at coarser levels, stating no encoding', () => {
        const {description} = read(bandMath(), {observed: [scalar('dem2'), array('elevation'), scalar('mean')]})

        assert.deepEqual(description.output.bands, [
            {name: 'dem2', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'},
            {name: 'elevation', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
            {name: 'mean', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
        ])
    })

    // The form names the second `red` `red_1` by default; only a final name must be unique.
    it('provides identically named bands of two inputs under the distinct names they are given', () => {
        const recipe = bandMath({outputImages: [
            outputImage('i-1', [outputBand('red')]),
            outputImage('i-2', [outputBand('red', {defaultOutputName: 'red_1'})])
        ]})

        const {status, description} = read(recipe, {observed: [scalar('red'), scalar('red_1')]})

        assert.equal(status, 'READY')
        assert.deepEqual(description.output.bands.map(({name}) => name), ['red', 'red_1'])
    })

    it('is refused where its running image does not report a band\'s dimensionality', () => {
        const result = read(bandMath(), {observed: [{name: 'dem2'}, scalar('elevation'), scalar('mean')]})

        assert.equal(result.status, 'INVALID')
        assert.deepEqual(
            result.diagnostics,
            [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType'], recipePath: ['band-math-1']}]
        )
    })
})

describe('a Band Math recipe whose running image is not observed', () => {
    it('needs that observation and offers nothing meanwhile', () => {
        const result = read(bandMath())

        assert.equal(result.status, 'NEEDS_EVIDENCE')
        assert.equal(result.description, null)
        assert.deepEqual(result.needs.observations, [{type: 'RECIPE_REF', id: 'band-math-1'}])
        assert.deepEqual(result.diagnostics.map(({code}) => code), ['UNAVAILABLE_DESCRIPTION'])
    })
})

describe('a Band Math recipe configured with no output bands', () => {
    it('provides none, observing nothing', () => {
        const result = read(bandMath({outputImages: []}))

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.description.output.bands, [])
        assert.deepEqual(result.needs.observations, [])
    })
})

describe('a Band Math recipe naming two output bands alike', () => {
    it('is refused from its configuration, observing nothing', () => {
        const result = read(bandMath({outputImages: [
            outputImage('i-1', [outputBand('elevation', {outputName: 'x'})]),
            outputImage('c-1', [outputBand('doubled', {defaultOutputName: 'x'})])
        ]}))

        assert.equal(result.status, 'INVALID')
        assert.deepEqual(result.diagnostics, [{
            code: 'DUPLICATE_BAND_NAME',
            path: ['model', 'outputBands', 'outputImages', 1, 'outputBands', 0],
            recipePath: ['band-math-1']
        }])
        assert.deepEqual(result.needs.observations, [])
    })
})

describe('a Band Math recipe whose running image contradicts its configuration', () => {
    for (const [scenario, observed] of [
        ['names another band', [scalar('dem2'), scalar('elevation'), scalar('mean_1')]],
        ['misses a band', [scalar('dem2'), scalar('elevation')]],
        ['orders them otherwise', [scalar('elevation'), scalar('dem2'), scalar('mean')]]
    ]) {
        it(`is refused when the image ${scenario}`, () => {
            const result = read(bandMath(), {observed})

            assert.equal(result.status, 'INVALID')
            assert.deepEqual(result.diagnostics, [
                {code: 'CONFLICTING_OBSERVATION', path: ['model', 'outputBands'], recipePath: ['band-math-1']}
            ])
        })
    }
})

// Declared, not assigned: the contradiction table is built while its describe runs, before assignments below it.
function scalar(name) {
    return {name, dataType: {arrayDimensions: 0}}
}

function array(name) {
    return {name, dataType: {arrayDimensions: 1}}
}

const outputBand = (name, {defaultOutputName = name, outputName} = {}) =>
    ({id: `${name}-id`, name, defaultOutputName, ...(outputName && {outputName})})

const outputImage = (imageId, outputBands) => ({imageId, outputBands})

// Two inputs and two calculations, one of them intermediate: no output band is taken from it.
const OUTPUT_IMAGES = [
    outputImage('c-1', [outputBand('doubled', {outputName: 'dem2'})]),
    outputImage('i-1', [outputBand('elevation')]),
    outputImage('c-2', [outputBand('mean')])
]

const bandMath = ({outputImages = OUTPUT_IMAGES} = {}) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', name: 'i1', type: 'ASSET', id: 'users/x/dem', includedBands: [{id: 'b1', name: 'elevation'}]},
            {imageId: 'i-2', name: 'i2', type: 'ASSET', id: 'users/x/water', includedBands: [{id: 'b2', name: 'occurrence'}]}
        ]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', dataType: 'int16'},
            {imageId: 'c-2', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'auto'},
            {imageId: 'c-3', name: 'c3', type: 'EXPRESSION', expression: 'c1 + 1', dataType: 'auto'}
        ]},
        outputBands: {outputImages}
    }
})

const read = (recipe, {observed} = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => type === 'RECIPE_REF' && id === recipe.id && observed
        ? {bands: observed}
        : undefined
})
