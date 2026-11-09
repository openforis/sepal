import {legacy_createStore as createStore} from 'redux'
import {describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// What a commit of Band Math's configuration derives with it (derivations.js), over a real store, judged by what its
// configuration needs of itself.

vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: key => key}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('./bandMath')
const {commitRecipe} = await import('../editing/derivedResult')
const {readSourceRequirements, readKey} = await import('../requirements/sourceRequirements')
const {hasUniqueOutputNames, outputNameOf} = await import('./panels/outputBands/outputImages')

addRecipeType(bandMath())

const ID = 'band-math-1'

let store

describe('an input band a chain of calculations reads', () => {
    it('unselected leaves every expression, derived band and output name as it was, and selected again meets them all', () => {
        open(CHAIN)
        const before = model()

        setInputBands([RED])

        expect(unmet()).toEqual(['bandMath.calculations|calc-1'])
        expect(model().calculations).toEqual(before.calculations)
        expect(model().outputBands).toEqual(before.outputBands)

        setInputBands([RED, NIR])

        expect(unmet()).toEqual([])
        expect(model().calculations).toEqual(before.calculations)
        expect(model().outputBands).toEqual(before.outputBands)
    })

    it('renamed is renamed throughout the chain, its output keeping the name it was given', () => {
        open(CHAIN)

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(calculations().map(({expression}) => expression)).toEqual(['i1.veg', 'c1', 'c2 * 2'])
        expect(calculations().map(bandsOf)).toEqual([['nir-id:veg'], ['nir-id:veg'], ['nir-id:veg']])
        expect(outputBand()).toMatchObject({id: 'nir-id', name: 'veg', outputName: 'custom'})
        expect(unmet()).toEqual([])
    })

    it('renamed is renamed in a calculation reading it through two calculations, and that calculation derived', () => {
        open(BRANCHES)

        setInputBands([{...RED, name: 'veg'}, NIR])

        expect(calculations().map(({expression}) => expression)).toEqual(['i1.veg', 'i1.veg * 2', 'c1.veg + c2.veg'])
        expect(calculations().map(bandsOf)).toEqual([['red-id:veg'], ['red-id:veg'], ['red-id:veg']])
        expect(unmet()).toEqual([])
    })
})

describe('a calculation repaired at the head of a chain', () => {
    it('has every calculation after it derived again from it, in one go', () => {
        open(CHAIN)
        setInputBands([RED])

        setCalculation('calc-1', {expression: 'i1.red', includedBands: [{...RED, imageId: 'img-1', imageName: 'i1'}]})

        expect(calculations().map(bandsOf)).toEqual([['red-id:red'], ['red-id:red'], ['red-id:red']])
        expect(unmet()).toEqual([])
    })
})

describe('a calculation found unmet', () => {
    it('is not marked in the model', () => {
        open(CHAIN)

        setInputBands([RED])

        expect(calculations().some(calculation => 'invalid' in calculation)).toBe(false)
    })
})

describe('a calculation saved with bands its expression no longer yields', () => {
    it('keeps them through a commit changing nothing it reads, and is derived once what it reads changes', () => {
        open({...WHOLE_IMAGE, images: [INPUT, I2]})
        const saved = calculations()[0]

        setInputs([INPUT, {...I2, includedBands: [...I2.includedBands, B2]}])

        expect(calculations()[0]).toBe(saved)

        setInputs([{...INPUT, includedBands: [RED, NIR, SWIR]}, I2])

        expect(bandsOf(calculations()[0])).toEqual(['red-id:red', 'nir-id:nir', 'swir-id:swir'])
    })
})

describe('a band renamed to a name another output has', () => {
    it('is given a unique default output name, the others kept', () => {
        open(NAMED)

        renameCalculationBand('red')

        expect(outputNames()).toEqual(['red', 'nir', 'red_1'])
        expect(hasUniqueOutputNames(outputImages())).toBe(true)
    })

    it('takes the suffix no output has, custom names counted', () => {
        open(withOutputBand(NAMED, 'img-1', 'nir-id', {outputName: 'red_1'}))

        renameCalculationBand('red')

        expect(outputNames()).toEqual(['red', 'red_1', 'red_2'])
        expect(hasUniqueOutputNames(outputImages())).toBe(true)
    })

    it('keeps its custom output name', () => {
        open(withOutputBand(NAMED, 'calc-1', 'nir-id', {outputName: 'custom'}))

        renameCalculationBand('red')

        expect(outputBands('calc-1')).toEqual([expect.objectContaining({id: 'nir-id', name: 'red', outputName: 'custom'})])
        expect(outputNames()).toEqual(['red', 'nir', 'custom'])
    })

    it('by a calculation another reads, takes the suffix while the other keeps the name it was output under', () => {
        open(withExpression(CHAIN_OUTPUT, 'calc-2', 'c1 * 2'))

        setCalculation('calc-1', {bandName: 'nir_2', includedBands: [{...derived('img-1', 'i1'), name: 'nir_2', userBandName: 'nir_2'}]})

        expect(outputImages().map(({imageId, outputBands}) => `${imageId}:${outputBands.map(outputNameOf)}`))
            .toEqual(['img-1:nir', 'calc-1:nir_2_1', 'calc-2:nir_2', 'calc-3:custom'])
        expect(unmet()).toEqual([])
    })

    it('by an input two calculations read, leaves each calculation the name it was output under while the other can take it', () => {
        open(PARALLEL)

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(outputImages().map(({imageId, outputBands}) => `${imageId}:${outputBands.map(outputNameOf)}`))
            .toEqual(['img-1:veg_1', 'calc-1:veg_2', 'calc-2:veg'])
    })

    it('is left as saved by a commit changing nothing it reads, however its names collide', () => {
        const saved = withOutputBand(NAMED, 'calc-1', 'nir-id', {defaultOutputName: 'red'})
        open(saved)

        setCalculation('calc-1', {dataType: 'float'})

        expect(outputImages()).toEqual(saved.outputImages)
    })
})

describe('an input band renamed throughout a chain whose outputs all take its name', () => {
    it('names each output apart in turn, each keeping its band', () => {
        open(CHAIN_OUTPUT)

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(outputImages().map(({imageId, outputBands}) => outputBands.map(({id, name}) => `${imageId}:${id}:${name}`)))
            .toEqual([['img-1:nir-id:veg'], ['calc-1:nir-id:veg'], ['calc-2:nir-id:veg'], ['calc-3:nir-id:veg']])
        expect(outputNames()).toEqual(['veg', 'veg_1', 'veg_2', 'custom'])
        expect(hasUniqueOutputNames(outputImages())).toBe(true)
    })
})

describe('a commit', () => {
    it('is one write, holding everything it derives', () => {
        open(CHAIN_OUTPUT)
        const states = []
        const unsubscribe = store.subscribe(() => states.push(model()))

        setInputBands([RED, {...NIR, name: 'veg'}])
        unsubscribe()

        expect(states).toEqual([model()])
        expect(calculations().map(bandsOf)).toEqual([['nir-id:veg'], ['nir-id:veg'], ['nir-id:veg']])
    })

    it('changing nothing a calculation reads leaves calculations, outputs and visualizations as they were', () => {
        open({...CHAIN_OUTPUT, images: [INPUT, I2]}, VISUALIZED)
        const before = recipe()

        setInputs([INPUT, {...I2, includedBands: [...I2.includedBands, B2]}])

        expect(model().calculations).toBe(before.model.calculations)
        expect(model().outputBands).toBe(before.model.outputBands)
        expect(recipe().layers).toBe(before.layers)
    })

    it('renames the visualizations reading an output it renames', () => {
        open(CHAIN_OUTPUT, VISUALIZED)

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(visualizations().map(({bands}) => bands)).toEqual([['veg', 'custom']])
    })

    it('has each visualization channel follow the output it read, where two calculations output copies of one band', () => {
        open(PARALLEL, {userDefinedVisualizations: {'this-recipe': [{id: 'vis-1', type: 'rgb', bands: ['nir', 'nir_1', 'veg']}]}})

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(outputImages().map(({imageId, outputBands}) => `${imageId}:${outputBands.map(outputNameOf)}`))
            .toEqual(['img-1:veg_1', 'calc-1:veg_2', 'calc-2:veg'])
        expect(visualizations().map(({bands}) => bands)).toEqual([['veg_1', 'veg_2', 'veg']])
    })

    it('renaming an output no visualization reads creates no visualizations', () => {
        open(CHAIN_OUTPUT)

        setInputBands([RED, {...NIR, name: 'veg'}])

        expect(recipe().layers).toBeUndefined()
    })
})

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const SWIR = {id: 'swir-id', name: 'swir'}
const B2 = {id: 'b2-id', name: 'b2'}
const INPUT = {imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR]}
const I2 = {imageId: 'img-2', name: 'i2', type: 'ASSET', id: 'users/x/other', includedBands: [{id: 'b1-id', name: 'b1'}]}

const read = (band, imageId, name) => ({...band, imageId, imageName: name})
const derived = (imageId, name) => read(NIR, imageId, name)

const expression = (imageId, name, text, usedBands, includedBands = usedBands) =>
    ({imageId, name, type: 'EXPRESSION', expression: text, dataType: 'auto', bandRenameStrategy: 'SUFFIX', usedBands, includedBands})

// c1 reads i1.nir, c2 reads c1 whole, and c3 doubles c2, output as `custom`.
const CHAIN = {
    images: [INPUT],
    calculations: [
        expression('calc-1', 'c1', 'i1.nir', [derived('img-1', 'i1')]),
        expression('calc-2', 'c2', 'c1', [derived('calc-1', 'c1')]),
        expression('calc-3', 'c3', 'c2 * 2', [derived('calc-2', 'c2')])
    ],
    outputImages: [{imageId: 'calc-3', name: 'c3', type: 'EXPRESSION', includedBands: [derived('calc-2', 'c2')],
        outputBands: [{...derived('calc-2', 'c2'), defaultOutputName: 'nir', outputName: 'custom'}]}]
}

// c1 and c2 each read i1.red, and c3 reads the band of both by name.
const BRANCHES = {
    images: [INPUT],
    calculations: [
        expression('calc-1', 'c1', 'i1.red', [read(RED, 'img-1', 'i1')]),
        expression('calc-2', 'c2', 'i1.red * 2', [read(RED, 'img-1', 'i1')]),
        expression('calc-3', 'c3', 'c1.red + c2.red', [read(RED, 'calc-1', 'c1'), read(RED, 'calc-2', 'c2')],
            [read(RED, 'calc-1', 'c1')])
    ],
    outputImages: []
}

// c1 reads i1 whole, saved when i1 had only nir.
const WHOLE_IMAGE = {
    images: [INPUT],
    calculations: [{...expression('calc-1', 'c1', 'i1', [derived('img-1', 'i1')]), bandRename: ''}],
    outputImages: []
}

// c1 names the band it reads from i1.nir `ndvi`; i1 outputs both its bands, and c1 its one.
const C1_BAND = {...derived('img-1', 'i1'), name: 'ndvi', userBandName: 'ndvi'}
const NAMED = {
    images: [INPUT],
    calculations: [
        {...expression('calc-1', 'c1', 'i1.nir', [derived('img-1', 'i1')], [C1_BAND]), bandName: 'ndvi'}
    ],
    outputImages: [
        {...INPUT, outputBands: [{...RED, defaultOutputName: 'red'}, {...NIR, defaultOutputName: 'nir'}]},
        {imageId: 'calc-1', name: 'c1', type: 'EXPRESSION', includedBands: [C1_BAND],
            outputBands: [{...C1_BAND, defaultOutputName: 'ndvi'}]}
    ]
}

// The chain, with i1's nir and every calculation output, each under the name it was given when added.
const CHAIN_OUTPUT = {
    ...CHAIN,
    outputImages: [
        {...INPUT, outputBands: [{...NIR, defaultOutputName: 'nir'}]},
        {imageId: 'calc-1', name: 'c1', type: 'EXPRESSION', includedBands: [derived('img-1', 'i1')],
            outputBands: [{...derived('img-1', 'i1'), defaultOutputName: 'nir_1'}]},
        {imageId: 'calc-2', name: 'c2', type: 'EXPRESSION', includedBands: [derived('calc-1', 'c1')],
            outputBands: [{...derived('calc-1', 'c1'), defaultOutputName: 'nir_2'}]},
        ...CHAIN.outputImages
    ]
}

// c1 and c2 each read i1.nir, i1's nir and c1 output under the names they were given when added, c2 under `veg`.
const PARALLEL = {
    images: [INPUT],
    calculations: [
        expression('calc-1', 'c1', 'i1.nir', [derived('img-1', 'i1')]),
        expression('calc-2', 'c2', 'i1.nir * 3', [derived('img-1', 'i1')])
    ],
    outputImages: [
        CHAIN_OUTPUT.outputImages[0],
        CHAIN_OUTPUT.outputImages[1],
        {imageId: 'calc-2', name: 'c2', type: 'EXPRESSION', includedBands: [derived('img-1', 'i1')],
            outputBands: [{...derived('img-1', 'i1'), defaultOutputName: 'veg'}]}
    ]
}

// A visualization of i1's nir output and c3's custom one.
const VISUALIZED = {userDefinedVisualizations: {'this-recipe': [{id: 'vis-1', type: 'rgb', bands: ['nir', 'custom']}]}}

const withExpression = (configuration, imageId, text) => ({
    ...configuration,
    calculations: configuration.calculations.map(calculation =>
        calculation.imageId === imageId ? {...calculation, expression: text} : calculation)
})

const withOutputBand = (configuration, imageId, id, changes) => ({
    ...configuration,
    outputImages: configuration.outputImages.map(outputImage => outputImage.imageId === imageId
        ? {...outputImage, outputBands: outputImage.outputBands.map(band => band.id === id ? {...band, ...changes} : band)}
        : outputImage)
})

function open({images, calculations, outputImages}, layers) {
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID, type: 'BAND_MATH', revision: 1, ui: {initialized: true},
                    model: {inputImagery: {images}, calculations: {calculations}, outputBands: {outputImages}},
                    ...(layers && {layers})
                }
            },
            recipes: [{id: ID, name: 'Band math', type: 'BAND_MATH', revision: 1}],
            saveStates: {},
            tabs: [{id: ID}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
}

// A change committed as a panel's Apply commits it.
function commit(name, path, change) {
    commitRecipe(['process.loadedRecipes', ID], actionBuilder(name)[change.assign ? 'assign' : 'set'](['process.loadedRecipes', ID, path], change.value))
}

function setInputs(images) {
    commit('SET_INPUTS', 'model.inputImagery.images', {value: images})
}

function setInputBands(includedBands) {
    setInputs([{...INPUT, includedBands}])
}

function setCalculation(imageId, changes) {
    commit('SET_CALCULATION', ['model.calculations.calculations', {imageId}], {value: changes, assign: true})
}

// c1's band renamed as its panel applies a band name.
function renameCalculationBand(bandName) {
    setCalculation('calc-1', {bandName, includedBands: [{...C1_BAND, name: bandName, userBandName: bandName}]})
}

function recipe() {
    return selectFrom(store.getState(), ['process.loadedRecipes', ID])
}

function model() {
    return recipe().model
}

function calculations() {
    return model().calculations.calculations
}

function bandsOf({includedBands}) {
    return includedBands.map(({id, name}) => `${id}:${name}`)
}

function outputBand() {
    return model().outputBands.outputImages[0].outputBands[0]
}

function outputImages() {
    return model().outputBands.outputImages
}

function outputBands(imageId) {
    return outputImages().find(outputImage => outputImage.imageId === imageId).outputBands
}

function outputNames() {
    return outputImages().flatMap(({outputBands}) => outputBands.map(outputNameOf))
}

function visualizations() {
    return recipe().layers.userDefinedVisualizations['this-recipe']
}

function unmet() {
    return readSourceRequirements({state: store.getState(), recipe: recipe(), heldFor: () => undefined})
        .filter(({item, verdict}) => item && verdict.status !== 'SUPPORTED')
        .map(readKey)
}
