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

        expect(status).toBe('READY')
        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: 'band-math-1'})
        expect(description.output.bands.map(({name}) => name)).toEqual(['dem2', 'elevation', 'mean'])
        expect(description.evidence).toEqual([])
    })

    it('averages a verified scalar and samples a verified array at coarser levels, stating no encoding', () => {
        const {description} = read(bandMath(), {observed: [scalar('dem2'), array('elevation'), scalar('mean')]})

        expect(description.output.bands).toEqual([
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

        expect(status).toBe('READY')
        expect(description.output.bands.map(({name}) => name)).toEqual(['red', 'red_1'])
    })

    it('leaves a band whose dimensionality was not observed unknown, with no policy', () => {
        const {description} = read(bandMath(), {observed: [{name: 'dem2'}, scalar('elevation'), scalar('mean')]})

        expect(description.output.bands[0]).toEqual({name: 'dem2'})
    })
})

describe('a Band Math recipe whose running image is not observed', () => {
    it('needs that observation and offers nothing meanwhile', () => {
        const result = read(bandMath())

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.description).toBeNull()
        expect(result.needs.observations).toEqual([{type: 'RECIPE_REF', id: 'band-math-1'}])
        expect(result.diagnostics.map(({code}) => code)).toEqual(['UNAVAILABLE_DESCRIPTION'])
    })
})

describe('a Band Math recipe configured with no output bands', () => {
    it('provides none, observing nothing', () => {
        const result = read(bandMath({outputImages: []}))

        expect(result.status).toBe('READY')
        expect(result.description.output.bands).toEqual([])
        expect(result.needs.observations).toEqual([])
    })
})

describe('a Band Math recipe naming two output bands alike', () => {
    it('is refused from its configuration, observing nothing', () => {
        const result = read(bandMath({outputImages: [
            outputImage('i-1', [outputBand('elevation', {outputName: 'x'})]),
            outputImage('c-1', [outputBand('doubled', {defaultOutputName: 'x'})])
        ]}))

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([{
            code: 'DUPLICATE_BAND_NAME',
            path: ['model', 'outputBands', 'outputImages', 1, 'outputBands', 0],
            recipePath: ['band-math-1']
        }])
        expect(result.needs.observations).toEqual([])
    })
})

describe('a Band Math recipe whose running image contradicts its configuration', () => {
    it.each([
        ['names another band', [scalar('dem2'), scalar('elevation'), scalar('mean_1')]],
        ['misses a band', [scalar('dem2'), scalar('elevation')]],
        ['orders them otherwise', [scalar('elevation'), scalar('dem2'), scalar('mean')]]
    ])('is refused when the image %s', (_case, observed) => {
        const result = read(bandMath(), {observed})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([
            {code: 'CONFLICTING_OBSERVATION', path: ['model', 'outputBands'], recipePath: ['band-math-1']}
        ])
    })
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
