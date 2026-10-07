import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// What follows an edit of Band Math's configuration, with the editor's sync mounted over a real store, judged by what its
// configuration needs of itself.

vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('../bandMath')
const {Sync} = await import('./sync')
const {readSourceRequirements, readKey} = await import('../../sourceRequirements')

addRecipeType(bandMath())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'

let root, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe('an input band a chain of calculations reads', () => {
    it('unselected leaves every expression, derived band and output name as it was, and selected again meets them all', async () => {
        await sync(CHAIN)
        const before = model()

        await setInputBands([RED])

        expect(unmet()).toEqual(['bandMath.calculations|calc-1', 'bandMath.calculations|calc-2', 'bandMath.calculations|calc-3', 'bandMath.outputs|calc-3'])
        expect(model().calculations).toEqual(before.calculations)
        expect(model().outputBands).toEqual(before.outputBands)

        await setInputBands([RED, NIR])

        expect(unmet()).toEqual([])
        expect(model().calculations).toEqual(before.calculations)
        expect(model().outputBands).toEqual(before.outputBands)
    })

    it('renamed is renamed throughout the chain, its output keeping the name it was given', async () => {
        await sync(CHAIN)

        await setInputBands([RED, {...NIR, name: 'veg'}])

        expect(calculations().map(({expression}) => expression)).toEqual(['i1.veg', 'c1', 'c2 * 2'])
        expect(calculations().map(({includedBands}) => includedBands.map(({id, name}) => `${id}:${name}`)))
            .toEqual([['nir-id:veg'], ['nir-id:veg'], ['nir-id:veg']])
        expect(outputBand()).toMatchObject({id: 'nir-id', name: 'veg', outputName: 'custom'})
        expect(unmet()).toEqual([])
    })
})

describe('a calculation repaired at the head of a chain', () => {
    it('has every calculation after it derived again from it, in one go', async () => {
        await sync(CHAIN)
        await setInputBands([RED])

        await setCalculation('calc-1', {expression: 'i1.red', includedBands: [{...RED, imageId: 'img-1', imageName: 'i1'}]})

        expect(calculations().map(({includedBands}) => includedBands.map(({id, name}) => `${id}:${name}`)))
            .toEqual([['red-id:red'], ['red-id:red'], ['red-id:red']])
        expect(unmet()).toEqual([])
    })
})

describe('a calculation found unmet', () => {
    it('is not marked in the model', async () => {
        await sync(CHAIN)

        await setInputBands([RED])

        expect(calculations().some(calculation => 'invalid' in calculation)).toBe(false)
    })
})

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const INPUT = {imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR]}

const derived = (imageId, name) => ({...NIR, imageId, imageName: name})

// c1 reads i1.nir, c2 reads c1 whole, and c3 doubles c2, output as `custom`.
const CHAIN = {
    images: [INPUT],
    calculations: [
        {imageId: 'calc-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.nir', dataType: 'auto', bandRenameStrategy: 'SUFFIX',
            usedBands: [derived('img-1', 'i1')], includedBands: [derived('img-1', 'i1')]},
        {imageId: 'calc-2', name: 'c2', type: 'EXPRESSION', expression: 'c1', dataType: 'auto', bandRenameStrategy: 'SUFFIX',
            usedBands: [derived('calc-1', 'c1')], includedBands: [derived('calc-1', 'c1')]},
        {imageId: 'calc-3', name: 'c3', type: 'EXPRESSION', expression: 'c2 * 2', dataType: 'auto', bandRenameStrategy: 'SUFFIX',
            usedBands: [derived('calc-2', 'c2')], includedBands: [derived('calc-2', 'c2')]}
    ],
    outputImages: [{imageId: 'calc-3', name: 'c3', type: 'EXPRESSION', includedBands: [derived('calc-2', 'c2')],
        outputBands: [{...derived('calc-2', 'c2'), defaultOutputName: 'nir', outputName: 'custom'}]}]
}

async function sync({images, calculations, outputImages}) {
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID, type: 'BAND_MATH', revision: 1, ui: {initialized: true},
                    model: {inputImagery: {images}, calculations: {calculations}, outputBands: {outputImages}}
                }
            },
            recipes: [{id: ID, name: 'Band math', type: 'BAND_MATH', revision: 1}],
            saveStates: {},
            tabs: [{id: ID}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    root = createRoot(document.createElement('div'))
    await act(async () => root.render(<Provider store={store}><Recipe id={ID}><Sync/></Recipe></Provider>))
}

// An input's bands selected as its panel selects them, and everything that follows settled.
async function setInputBands(includedBands) {
    await act(async () => actionBuilder('SET_INPUT').set(['process.loadedRecipes', ID, 'model.inputImagery.images'], [{...INPUT, includedBands}]).dispatch())
    await settled()
}

// A calculation changed as its own panel applies it.
async function setCalculation(imageId, changes) {
    await act(async () => actionBuilder('SET_CALCULATION')
        .assign(['process.loadedRecipes', ID, 'model.calculations.calculations', {imageId}], changes)
        .dispatch())
    await settled()
}

async function settled() {
    for (let i = 0; i < 6; i++) {
        await act(async () => {})
    }
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

function outputBand() {
    return model().outputBands.outputImages[0].outputBands[0]
}

function unmet() {
    return readSourceRequirements({state: store.getState(), recipe: recipe()})
        .filter(({verdict}) => verdict.status !== 'SUPPORTED')
        .map(readKey)
}
