import {describe, expect, it, vi} from 'vitest'

// What Band Math's configuration is found to need of itself, read through the shared requirement reader as every
// consumer reads it: calculations from shared findings, output selections from their local rule.

vi.mock('~/translate', () => ({msg: key => key}))
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {readImageOutput} = await import('#sepal/recipe/output/readImageOutput')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {buildRecipeDependencyGraph} = await import('#sepal/recipe/source/dependencyGraph')

const {bandMathRequirements} = await import('./bandMathRequirements')
const {readSourceRequirements, readKey, requestGate} = await import('../sourceRequirements')

registry.BAND_MATH = {sourceRequirements: bandMathRequirements}

describe('a calculation', () => {
    it('reading the inputs and earlier calculations as configured is met', () => {
        expect(problemsOf(recipe())).toEqual({})
    })

    it('reading an input band no longer selected is unmet, naming the variable and band', () => {
        const model = recipe({images: [input(['red'])]})

        expect(readOf(model, CALCULATIONS, 'calc-1')).toMatchObject({
            own: [{code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}], unmet: [], status: 'UNSUPPORTED'
        })
    })

    it('reading a band twice says so once', () => {
        const model = recipe({images: [input(['red'])], calculations: [expression('calc-1', 'ndvi', 'i1.nir * i1.nir', ['ndvi'])]})

        expect(readOf(model, CALCULATIONS, 'calc-1').own).toEqual([{code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}])
    })

    it('reading a calculation that no longer exists is unmet, a function by its image, an expression by its variable', () => {
        const model = recipe({calculations: [
            func('calc-2', 'mx', [['calc-1', 'ndvi', 'ndvi']]),
            expression('calc-3', 'e', 'ndvi.ndvi + 1', ['e'])
        ]})

        expect(readOf(model, CALCULATIONS, 'calc-2').own).toEqual([{code: 'MISSING_IMAGE', variable: 'ndvi', band: 'ndvi'}])
        expect(readOf(model, CALCULATIONS, 'calc-3').own).toEqual([{code: 'UNKNOWN_VARIABLE', variable: 'ndvi'}])
    })

    it('reading a later calculation is unmet as a forward reference, naming it', () => {
        const model = recipe({calculations: [
            expression('calc-1', 'early', 'late.l * 2', ['early']),
            func('calc-2', 'f', [['calc-3', 'late', 'l']]),
            expression('calc-3', 'late', 'i1.red', ['l'])
        ]})

        expect(readOf(model, CALCULATIONS, 'calc-1').own).toEqual([{code: 'FORWARD_REFERENCE', variable: 'late', item: 'calc-3'}])
        expect(readOf(model, CALCULATIONS, 'calc-2').own).toEqual([{code: 'FORWARD_REFERENCE', variable: 'late', item: 'calc-3'}])
    })

    it('reading itself is unmet as a self reference', () => {
        const model = recipe({calculations: [
            expression('calc-1', 'ndvi', 'ndvi.ndvi + 1', ['ndvi']),
            func('calc-2', 'mx', [['calc-2', 'mx', 'max']])
        ]})

        expect(readOf(model, CALCULATIONS, 'calc-1').own).toEqual([{code: 'SELF_REFERENCE', variable: 'ndvi'}])
        expect(readOf(model, CALCULATIONS, 'calc-2').own).toEqual([{code: 'SELF_REFERENCE', variable: 'mx'}])
    })

    it.each([
        ['images read whole with different band counts', 'i1 + i2', 'INVALID_BAND_COUNT'],
        ['a function given too few arguments', 'max(i1.nir)', 'INVALID_ARG_COUNT'],
        ['an expression that cannot be read', '(i1.nir', 'SYNTAX_ERROR']
    ])('given %s is unmet as the editor finds it', (_case, text, code) => {
        const model = recipe({
            images: [input(['red', 'nir']), {imageId: 'img-2', name: 'i2', includedBands: ['a', 'b', 'c'].map(band)}],
            calculations: [expression('calc-1', 'c', text, ['c'])]
        })

        expect(readOf(model, CALCULATIONS, 'calc-1').own.map(({code}) => code)).toEqual([code])
    })

    it('reading an unmet calculation is held by it, keeping its own problems apart', () => {
        const model = recipe({images: [input(['red'])]})

        expect(readOf(model, CALCULATIONS, 'calc-2')).toMatchObject({
            own: [{code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}],
            unmet: [],
            status: 'UNSUPPORTED'
        })
    })

    it('leaves a dependent calculation without an invented problem of its own', () => {
        const model = recipe({
            images: [input(['red'])],
            calculations: [NDVI, func('calc-2', 'mx', [['calc-1', 'ndvi', 'ndvi']])]
        })

        expect(readOf(model, CALCULATIONS, 'calc-2')).toMatchObject({
            own: [], unmet: [], status: 'SUPPORTED'
        })
    })

    it('locates a chain failure only at its originating calculation', () => {
        const model = recipe({
            images: [input(['red'])],
            calculations: [NDVI, expression('calc-2', 'a', 'ndvi.ndvi * 2', ['a']), expression('calc-3', 'b', 'a.a + 1', ['b'])]
        })

        expect(readOf(model, CALCULATIONS, 'calc-3')).toMatchObject({own: [], unmet: [], status: 'SUPPORTED'})
    })

    it('not reading an unmet calculation is met', () => {
        const model = recipe({
            images: [input(['red'])],
            calculations: [NDVI, expression('calc-2', 'r', 'i1.red * 2', ['r'])]
        })

        expect(readOf(model, CALCULATIONS, 'calc-2')).toMatchObject({own: [], unmet: [], status: 'SUPPORTED'})
    })
})

describe('an output image', () => {
    it('taking a band its image does not have is unmet', () => {
        const model = recipe({outputImages: [{imageId: 'img-1', name: 'i1', outputBands: [{id: 'x', name: 'swir'}]}]})

        expect(readOf(model, OUTPUTS, 'img-1').own).toEqual([{code: 'UNKNOWN_BAND', variable: 'i1', band: 'swir'}])
    })

    it('taken from an image that no longer exists is unmet', () => {
        const model = recipe({outputImages: [{imageId: 'calc-9', name: 'gone', outputBands: [{id: 'g', name: 'g'}]}]})

        expect(readOf(model, OUTPUTS, 'calc-9').own).toEqual([{code: 'MISSING_IMAGE', variable: 'gone'}])
    })

    it('leaves an output of an unmet calculation without a problem of its own', () => {
        const model = recipe({images: [input(['red'])]})

        expect(readOf(model, OUTPUTS, 'calc-2')).toMatchObject({own: [], unmet: [], status: 'SUPPORTED'})
    })
})

describe('the image output', () => {
    it('is withdrawn, by Calculations, while any calculation is unmet, whether or not an output reads it', () => {
        const model = recipe({
            images: [input(['red'])],
            calculations: [NDVI, expression('calc-2', 'r', 'i1.red * 2', ['r'])],
            outputImages: [{imageId: 'calc-2', name: 'r', outputBands: [{id: 'r', name: 'r'}]}]
        })

        expect(requestGate({state: {}, recipe: model, operation: 'IMAGE_OUTPUT', heldFor: heldFor(model)}))
            .toMatchObject({code: 'CONFIGURATION_UNMET', withdraw: true, wait: false, section: 'process.bandMath.panel.calculations.button'})
    })

    it('is requested once every calculation and output is met', () => {
        const valid = recipe()
        expect(requestGate({state: {}, recipe: valid, operation: 'IMAGE_OUTPUT', heldFor: heldFor(valid)})).toBe(null)
    })
})

const CALCULATIONS = 'bandMath.calculations'
const OUTPUTS = 'bandMath.outputs'

function band(name) {
    return {id: `${name}-id`, name}
}

function input(bands) {
    return {imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/i1', includedBands: bands.map(band)}
}

function expression(imageId, name, text, bands) {
    return {imageId, name, type: 'EXPRESSION', expression: text, includedBands: bands.map(band), usedBands: []}
}

function func(imageId, name, usedBands) {
    return {
        imageId, name, type: 'FUNCTION', reducer: 'max', includedBands: [band('max')],
        usedBands: usedBands.map(([imageId, imageName, name]) => ({imageId, imageName, name, id: `${name}-id`}))
    }
}

// ndvi over i1, and mx the maximum of ndvi and i1.nir, mx output as peak and i1.red passed through.
const NDVI = expression('calc-1', 'ndvi', '(i1.nir - i1.red) / (i1.nir + i1.red)', ['ndvi'])
const MX = func('calc-2', 'mx', [['calc-1', 'ndvi', 'ndvi'], ['img-1', 'i1', 'nir']])

function recipe({
    images = [input(['red', 'nir'])],
    calculations = [NDVI, MX],
    outputImages = [
        {imageId: 'calc-2', name: 'mx', outputBands: [{id: 'max-id', name: 'max', outputName: 'peak'}]},
        {imageId: 'img-1', name: 'i1', outputBands: [{id: 'red-id', name: 'red'}]}
    ]
} = {}) {
    return {
        id: 'band-math-1',
        type: 'BAND_MATH',
        model: {inputImagery: {images}, calculations: {calculations}, outputBands: {outputImages: outputImages.map(image => ({...image, outputBands: image.outputBands.map(band => ({defaultOutputName: band.name, ...band}))}))}}
    }
}

const readsOf = recipe => readSourceRequirements({state: {}, recipe, heldFor: heldFor(recipe)})

const heldFor = recipe => {
    const result = readImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map()}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        readinessFor: ({type}) => recipeType(type),
        observationFor: ({type}) => ({bands: (type === 'ASSET' ? ['red', 'nir', 'a', 'b', 'c']
            : recipe.model.outputBands.outputImages.flatMap(image => image.outputBands.map(band => band.outputName || band.defaultOutputName)))
            .map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})
    })
    return () => result
}

// A read's own problems, the reads it waits on by key, and its effective verdict.
function readOf(recipe, declaration, item) {
    const read = readsOf(recipe).find(read => readKey(read) === `${declaration}|${item}`)
    return {
        own: read?.ownVerdict.diagnostic?.problems || read?.ownVerdict.diagnostic?.diagnostics?.flatMap(({problems}) => problems) || [],
        unmet: (read?.unmetPrerequisites || []).map(({declaration, item}) => `${declaration}|${item}`),
        status: read?.verdict.status || 'SUPPORTED',
        code: read?.verdict.diagnostic?.code
    }
}

function problemsOf(recipe) {
    return Object.fromEntries(readsOf(recipe)
        .filter(read => read.verdict.status !== 'SUPPORTED')
        .map(read => [readKey(read), read.verdict.diagnostic]))
}
