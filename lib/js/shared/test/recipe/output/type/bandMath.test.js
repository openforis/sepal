import {NEVER, of, throwError} from 'rxjs'

import {explainImageOutput$, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands a Band Math recipe provides: the output bands it is configured with, named and ordered as configured,
// with the dimensionality its running image is observed to have. A cast sets only the element type, and whether an
// expression or reducer yields an array depends on its inputs, so only an observation establishes it. Every band an
// input includes must be a band of that input's current description, and each input is held to its whole description.
// Statuses, codes and persisted field names are literals.

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

    it('is refused where its running image does not report a band\'s dimensionality', () => {
        const result = read(bandMath(), {observed: [{name: 'dem2'}, scalar('elevation'), scalar('mean')]})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType'], recipePath: ['band-math-1']}])
    })
})

describe('a Band Math recipe whose running image is not observed', () => {
    it('needs that observation and its inputs\', and offers nothing meanwhile', () => {
        const result = read(bandMath(), {inputs: {}})

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.description).toBeNull()
        expect(result.needs.observations).toHaveLength(3)
        expect(result.needs.observations).toEqual(expect.arrayContaining([
            {type: 'RECIPE_REF', id: 'band-math-1'},
            {type: 'ASSET', id: 'users/x/dem'},
            {type: 'ASSET', id: 'users/x/water'}
        ]))
    })
})

// Execution cannot build an image of no bands. The refusal is the configuration's, but its inputs are still judged.
describe('a Band Math recipe configured with no output bands', () => {
    it('is refused from its configuration, observing nothing of its own', () => {
        const result = read(bandMath({outputImages: []}))

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([
            {code: 'NO_OUTPUT_BANDS', path: ['model', 'outputBands', 'outputImages'], recipePath: ['band-math-1']}
        ])
        expect(result.needs.observations).toEqual([])
    })

    it('says which included bands an input it could read lacks', () => {
        const result = read(bandMath({outputImages: []}), {inputs: {...INPUT_BANDS, [WATER]: [scalar('other')]}})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics.map(({code, path}) => [code, path])).toEqual([
            ['NO_OUTPUT_BANDS', ['model', 'outputBands', 'outputImages']],
            ['MISSING_INPUT_BAND', [...IMAGES, 1, 'includedBands', 0]]
        ])
    })
})

// What an editor reads to explain a refusal: the inputs it names, observed once, each on its own. A consumer settling
// one description refuses at once, observing nothing.
describe('a Band Math recipe refused from its configuration, explained', () => {
    const duplicated = () => bandMath({outputImages: [
        outputImage('i-1', [outputBand('elevation', {outputName: 'x'})]),
        outputImage('c-1', [outputBand('doubled', {defaultOutputName: 'x'})])
    ]})

    it('is settled at once, observing nothing', () => {
        const requests = []
        const settled = []

        settledImageOutput$({
            graph: graphOf(duplicated()), declarationFor,
            observeBands$: request => {
                requests.push(request)
                return NEVER
            }
        }).subscribe(state => settled.push(state))

        expect(settled.map(({status}) => status)).toEqual(['INVALID'])
        expect(requests).toEqual([])
    })

    it('observes each input it names once, and says which included bands one lacks while another fails', () => {
        const requests = []
        const explained = []

        explainImageOutput$({
            graph: graphOf(duplicated()), declarationFor,
            observeBands$: request => {
                requests.push(request.reference.id)
                return request.reference.id === WATER
                    ? of([{name: 'other', arrayDimensions: 0}])
                    : throwError(() => new Error('unreadable'))
            }
        }).subscribe(explanation => explained.push(explanation))

        expect(requests).toEqual([DEM, WATER])
        expect(explained).toHaveLength(1)
        expect(explained[0].diagnostics.map(({code, path}) => [code, path])).toEqual([
            ['DUPLICATE_BAND_NAME', ['model', 'outputBands', 'outputImages', 1, 'outputBands', 0]],
            ['MISSING_INPUT_BAND', [...IMAGES, 1, 'includedBands', 0]]
        ])
        expect(explained[0].failures.map(({message}) => message)).toEqual(['unreadable'])
        expect(explained[0].observed).toBe(1)
    })

    it('finds nothing missing when every input fails, having observed nothing', () => {
        const explained = []

        explainImageOutput$({
            graph: graphOf(duplicated()), declarationFor,
            observeBands$: () => throwError(() => new Error('unreadable'))
        }).subscribe(explanation => explained.push(explanation))

        expect(explained[0].diagnostics.map(({code}) => code)).toEqual(['DUPLICATE_BAND_NAME'])
        expect(explained[0].failures).toHaveLength(2)
        expect(explained[0].observed).toBe(0)
    })

    it('explains nothing of a recipe that is not refused, observing nothing', () => {
        const requests = []
        const explained = []

        explainImageOutput$({
            graph: graphOf(bandMath()), declarationFor,
            observeBands$: request => {
                requests.push(request)
                return NEVER
            }
        }).subscribe(explanation => explained.push(explanation))

        expect(explained).toEqual([{diagnostics: [], failures: [], observed: 0}])
        expect(requests).toEqual([])
    })
})

// A refusal is settled from the configuration, whatever the inputs hold; what they hold explains what else needs repair.
describe('a Band Math recipe refused from its configuration', () => {
    const duplicated = () => bandMath({outputImages: [
        outputImage('i-1', [outputBand('elevation', {outputName: 'x'})]),
        outputImage('c-1', [outputBand('doubled', {defaultOutputName: 'x'})])
    ]})

    it('names the inputs it reads, though nothing of them is held', () => {
        const result = read(duplicated(), {inputs: {}})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics.filter(({code}) => code !== 'UNAVAILABLE_DESCRIPTION').map(({code}) => code))
            .toEqual(['DUPLICATE_BAND_NAME'])
        expect(result.needs.observations).toEqual([{type: 'ASSET', id: DEM}, {type: 'ASSET', id: WATER}])
    })

    it('says which included bands an input it could read lacks, while another could not be read', () => {
        const result = read(duplicated(), {inputs: {[WATER]: [scalar('other')]}})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics.filter(({code}) => code !== 'UNAVAILABLE_DESCRIPTION').map(({code, path}) => [code, path])).toEqual([
            ['DUPLICATE_BAND_NAME', ['model', 'outputBands', 'outputImages', 1, 'outputBands', 0]],
            ['MISSING_INPUT_BAND', [...IMAGES, 1, 'includedBands', 0]]
        ])
    })

    it('finds nothing missing from an input it could not read', () => {
        const result = read(duplicated(), {inputs: {[WATER]: [scalar('occurrence')]}})

        expect(result.diagnostics.map(({code}) => code)).not.toContain('MISSING_INPUT_BAND')
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

// Execution selects every band an input includes, so one its input lacks fails the image Earth Engine builds: observing
// that image fails too. Through the observer every runtime describes with, Earth Engine faked.
describe('a Band Math recipe including a band its input lacks', () => {
    const lacking = (includedBands, expression = 'i1.elevation') => overInputs([
        assetInput('i-1', DEM, includedBands)
    ], {expression})

    it('is refused where the band is included, though Earth Engine refuses its running image', () => {
        const {status, diagnostics, failures} = settle(lacking(['elevation', 'slope'], 'i1.slope'), {
            assets: {[DEM]: [scalar('elevation')]}
        })

        expect(status).toBe('INVALID')
        expect(diagnostics).toEqual([{code: 'MISSING_INPUT_BAND', path: [...IMAGES, 0, 'includedBands', 1], recipePath: ['band-math-1']}])
        expect(failures).toHaveLength(1)
    })

    it('is refused for a band no calculation reads', () => {
        const {status, diagnostics} = settle(lacking(['elevation', 'slope']), {
            assets: {[DEM]: [scalar('elevation')]}
        })

        expect(status).toBe('INVALID')
        expect(diagnostics.map(({code, path}) => [code, path])).toEqual([['MISSING_INPUT_BAND', [...IMAGES, 0, 'includedBands', 1]]])
    })

    it('is refused for a band a declared recipe does not provide, before anything is observed', () => {
        const {status, diagnostics, requests} = settle(overInputs([recipeInput('i-1', MOSAIC.id, ['red', 'not_a_band'])]), {
            records: [MOSAIC]
        })

        expect(status).toBe('INVALID')
        expect(diagnostics.map(({code, path}) => [code, path])).toEqual([['MISSING_INPUT_BAND', [...IMAGES, 0, 'includedBands', 1]]])
        expect(requests).toEqual([])
    })

    // The diagnosis stays with the recipe whose configuration includes the band, and the field it is included in.
    it('is refused through a nested Band Math where that one includes it', () => {
        const inner = overInputs([assetInput('i-1', DEM, ['elevation', 'slope'])], {id: 'inner', outputName: 'height'})

        const {status, diagnostics} = settle(overInputs([recipeInput('i-1', inner.id, ['height'])]), {
            records: [inner],
            assets: {[DEM]: [scalar('elevation')]}
        })

        expect(status).toBe('INVALID')
        expect(diagnostics).toEqual([{code: 'MISSING_INPUT_BAND', path: [...IMAGES, 0, 'includedBands', 1], recipePath: ['band-math-1', 'inner']}])
    })
})

describe('a Band Math recipe over inputs that hold what it includes', () => {
    it('is described from its running image over an asset, reading the asset', () => {
        const {status, description, requests} = settle(overInputs([assetInput('i-1', DEM, ['elevation'])]), {
            assets: {[DEM]: [scalar('elevation'), scalar('slope')]},
            images: {'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('READY')
        expect(description.output.bands.map(({name}) => name)).toEqual(['out'])
        expect(requests).toEqual(expect.arrayContaining([`ASSET:${DEM}`, 'RECIPE_REF:band-math-1']))
    })

    it('is described over a declared recipe, observing only its own image', () => {
        const {status, requests} = settle(overInputs([recipeInput('i-1', MOSAIC.id, ['red', 'nir'])]), {
            records: [MOSAIC],
            images: {'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('READY')
        expect(requests).toEqual(['RECIPE_REF:band-math-1'])
    })

    it('is described over a Masking, by the image it masks', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'ASSET', id: DEM}, imageMask: {type: 'ASSET', id: WATER}}}

        const {status} = settle(overInputs([recipeInput('i-1', masking.id, ['elevation'])]), {
            records: [masking],
            assets: {[DEM]: [scalar('elevation')]},
            images: {'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('READY')
    })

    it('is described over a nested Band Math, from both running images', () => {
        const inner = overInputs([assetInput('i-1', DEM, ['elevation'])], {id: 'inner', outputName: 'height'})

        const {status} = settle(overInputs([recipeInput('i-1', inner.id, ['height'])]), {
            records: [inner],
            assets: {[DEM]: [scalar('elevation')]},
            images: {inner: [scalar('height')], 'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('READY')
    })
})

// Reading its inputs holds each to its whole description, as any recipe reading another is held - whether or not Earth
// Engine would build what Band Math selects of it.
describe('a Band Math recipe over an input that cannot be described', () => {
    it.each([
        ['an included band', [{name: 'elevation'}, scalar('slope')], 0],
        ['a band it does not include', [scalar('elevation'), {name: 'slope'}], 1]
    ])('is refused for an asset reporting no dimensionality for %s', (_case, bands, index) => {
        const {status, diagnostics} = settle(overInputs([assetInput('i-1', DEM, ['elevation'])]), {
            assets: {[DEM]: bands},
            images: {'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('INVALID')
        expect(diagnostics).toEqual([{
            code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', index, 'dataType'], recipePath: ['band-math-1'],
            reference: {type: 'ASSET', id: DEM}
        }])
    })

    // Earth Engine builds the inner outputs as `x` and `x_1`, and the outer selects `x`; the inner recipe is refused.
    it('is refused over a nested Band Math naming two output bands alike, where that one is refused', () => {
        const inner = overInputs([assetInput('i-1', DEM, ['elevation'])], {id: 'inner'})
        inner.model.outputBands.outputImages = [
            outputImage('i-1', [outputBand('elevation', {defaultOutputName: 'x'})]),
            outputImage('c-1', [outputBand('doubled', {defaultOutputName: 'x'})])
        ]

        const {status, diagnostics} = settle(overInputs([recipeInput('i-1', inner.id, ['x'])]), {
            records: [inner],
            assets: {[DEM]: [scalar('elevation')]},
            images: {inner: [scalar('x'), scalar('x_1')], 'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('INVALID')
        expect(diagnostics).toEqual([{
            code: 'DUPLICATE_BAND_NAME', path: ['model', 'outputBands', 'outputImages', 1, 'outputBands', 0],
            recipePath: ['band-math-1', 'inner']
        }])
    })

    it('is unavailable, never refused, while an input cannot be read, its own image observed', () => {
        const failure = new Error('Earth Engine unavailable')

        const {status, diagnostics, error} = settle(overInputs([assetInput('i-1', DEM, ['elevation'])]), {
            assets: {[DEM]: failure},
            images: {'band-math-1': [scalar('out')]}
        })

        expect(status).toBe('UNAVAILABLE')
        expect(diagnostics.map(({code}) => code)).not.toContain('MISSING_INPUT_BAND')
        expect(error).toBe(failure)
    })

    it('needs the input\'s evidence, never refused, while it has not been read', () => {
        const result = read(overInputs([assetInput('i-1', DEM, ['elevation'])]), {
            inputs: {},
            observed: [scalar('out')]
        })

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.needs.observations).toEqual([{type: 'ASSET', id: DEM}])
    })
})

// Declared, not assigned: the contradiction table is built while its describe runs, before assignments below it.
function scalar(name) {
    return {name, dataType: {arrayDimensions: 0}}
}

function array(name) {
    return {name, dataType: {arrayDimensions: 1}}
}

const DEM = 'users/x/dem'
const WATER = 'users/x/water'
const IMAGES = ['model', 'inputImagery', 'images']

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

const outputBand = (name, {defaultOutputName = name, outputName} = {}) =>
    ({id: `${name}-id`, name, defaultOutputName, ...(outputName && {outputName})})

const outputImage = (imageId, outputBands) => ({imageId, outputBands})

const assetInput = (imageId, id, bands) => ({imageId, type: 'ASSET', id, bands})

const recipeInput = (imageId, id, bands) => ({imageId, type: 'RECIPE_REF', id, bands})

// Band Math over these inputs, outputting the first included band of the first under `outputName` through one
// expression over it.
const overInputs = (inputs, {id = 'band-math-1', outputName = 'out', expression} = {}) => ({
    id,
    type: 'BAND_MATH',
    model: {
        inputImagery: {images: inputs.map(({imageId, type, id, bands}, index) => ({
            imageId, name: `i${index + 1}`, type, id, includedBands: bands.map(name => ({id: `${name}-id`, name}))
        }))},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: expression || `i1.${inputs[0].bands[0]}`, dataType: 'auto'}
        ]},
        outputBands: {outputImages: [outputImage('c-1', [outputBand('doubled', {defaultOutputName: outputName})])]}
    }
})

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
            {imageId: 'i-1', name: 'i1', type: 'ASSET', id: DEM, includedBands: [{id: 'b1', name: 'elevation'}]},
            {imageId: 'i-2', name: 'i2', type: 'ASSET', id: WATER, includedBands: [{id: 'b2', name: 'occurrence'}]}
        ]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', dataType: 'int16'},
            {imageId: 'c-2', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'auto'},
            {imageId: 'c-3', name: 'c3', type: 'EXPRESSION', expression: 'c1 + 1', dataType: 'auto'}
        ]},
        outputBands: {outputImages}
    }
})

const INPUT_BANDS = {[DEM]: [scalar('elevation')], [WATER]: [scalar('occurrence')]}

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const graphOf = recipe => buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])})

// What can be said from what is held: the recipe's own observation, where given, and its input assets' bands.
const read = (recipe, {observed, inputs = INPUT_BANDS} = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    declarationFor,
    observationFor: ({type, id}) => {
        if (type === 'ASSET') {
            return inputs[id] && {bands: inputs[id], evidence: []}
        }
        return id === recipe.id && observed ? {bands: observed} : undefined
    }
})

// One description settled through the observer, Earth Engine answering each request at once: an asset with its bands,
// a recipe's running image with those a scenario says it builds, or failing - as it fails an image selecting a band
// its input lacks. A request answered with an Error fails with it.
const settle = (recipe, {records = [], assets = {}, images = {}} = {}) => {
    const requests = []
    const graph = buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([recipe, ...records].map(record => [record.id, record]))})
    const observeBands$ = ({reference: {type, id}}) => {
        requests.push(`${type}:${id}`)
        const answer = type === 'ASSET' ? assets[id] : images[id]
        if (answer instanceof Error) {
            return throwError(() => answer)
        }
        return answer
            ? of(answer.map(({name, dataType}) => ({name, ...(dataType && {arrayDimensions: dataType.arrayDimensions})})))
            : throwError(() => new Error(`Earth Engine refused ${id}`))
    }
    let settled = null
    settledImageOutput$({graph, observeBands$, declarationFor}).subscribe(result => settled = result)
    return {...settled, requests}
}
