import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// The output bands of an image as its panel lists them, over a real store. A saved recipe can output one band of an
// input twice: a copy under a legacy id and one under the band's own, apart, each with a name of its own.

// Storage never answers: what is saved is not the concern here.
vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The panel is open, and closes as it does when applied or cancelled.
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: () => Component => props => {
            const [active, setActive] = useState(true)
            return active
                ? <Component {...props} activatable={{active, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})

// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {OutputBands} = await import('./outputBands')
const {findChanges} = await import('../../sync/findChanges')
const {updateOutputBands} = await import('../../sync/updateOutputBands')
const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('../../bandMath')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(bandMath())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'
const ADD_ALL = 'process.bandMath.panel.outputBands.addBands.all.label'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('two outputs of one input band', () => {
    it.each([
        ['first', LEGACY_COPY, CURRENT_COPY],
        ['second', CURRENT_COPY, LEGACY_COPY]
    ])('are listed without the %s once it is removed, and Apply saves the other', async (_case, removed, remaining) => {
        await openOutputBands()

        await remove(rowOf(removed))

        expect(rows().map(placeholder)).toEqual([remaining.defaultOutputName])
        await apply()
        expect(savedCopies()).toEqual([remaining])
    })

    it.each([
        ['first', LEGACY_COPY, CURRENT_COPY],
        ['second', CURRENT_COPY, LEGACY_COPY]
    ])('keep the name being given to one when the %s is removed', async (_case, removed, remaining) => {
        await openOutputBands()
        await type(rowOf(remaining), 'renamed')

        await remove(rowOf(removed))

        expect(rows().map(value)).toEqual(['renamed'])
        await apply()
        expect(savedCopies()).toEqual([{...remaining, outputName: 'renamed'}])
    })

    it('keep an invalid name being given to one holding back Apply when the other is removed', async () => {
        await openOutputBands()
        await type(rowOf(CURRENT_COPY), '1_invalid')

        await remove(rowOf(LEGACY_COPY))

        expect(applyEnabled()).toBe(false)
    })

    it('hold nothing back once the one given an invalid name is removed', async () => {
        await openOutputBands()
        await type(rowOf(CURRENT_COPY), '1_invalid')

        await remove(rowOf(CURRENT_COPY))

        expect(applyEnabled()).toBe(true)
        await apply()
        expect(savedCopies()).toEqual([LEGACY_COPY])
    })

    it('keep an invalid name being given to one holding back Apply when the other is given a valid one', async () => {
        await openOutputBands()
        await type(rowOf(CURRENT_COPY), '1_invalid')

        await type(rowOf(LEGACY_COPY), 'valid_name')

        expect(applyEnabled()).toBe(false)
    })

    it('are both kept when the panel is cancelled', async () => {
        await openOutputBands()

        await remove(rowOf(LEGACY_COPY))
        await cancel()

        expect(savedCopies()).toEqual([LEGACY_COPY, CURRENT_COPY])
    })
})

describe('the names bands are output under', () => {
    it.each([
        ['an invalid name', '1_invalid'],
        ['the name the other is output under', LEGACY_COPY.defaultOutputName]
    ])('hold back Apply while one is given %s, a band being added, until it is repaired', async (_case, name) => {
        await openOutputBands()
        await type(rowOf(CURRENT_COPY), name)

        await addBand(NIR.name)
        expect(applyEnabled()).toBe(false)

        await type(rowOf(CURRENT_COPY), 'repaired')
        expect(applyEnabled()).toBe(true)
    })

    it.each([
        ['an invalid name', '1_invalid'],
        ['the name the other is output under', CURRENT_COPY.defaultOutputName]
    ])('hold back Apply where a saved recipe gave one %s, once a band is added', async (_case, name) => {
        await openOutputBands([{...LEGACY_COPY, outputName: name}, CURRENT_COPY])

        await addBand(NIR.name)

        expect(applyEnabled()).toBe(false)
    })
})

// What Band Math needs of its configuration judges what was applied; the panel's Apply stays the panel's.
describe('output bands Band Math finds an output of unmet', () => {
    it('are applied as before', async () => {
        await openOutputBands([...OUTPUT_BANDS, {id: 'swir-id', name: 'swir', defaultOutputName: 'swir'}])
        await type(rowOf(CURRENT_COPY), 'renamed')

        await apply()

        expect(savedCopies()).toEqual([LEGACY_COPY, {...CURRENT_COPY, outputName: 'renamed'}])
    })
})

describe('an output whose image no longer exists', () => {
    it.each([
        ['a calculation', ORPHANED_CALCULATION],
        ['a recipe input', ORPHANED_RECIPE_INPUT]
    ])('taken from %s is listed as saved, saying so, offering no bands to add', async (_case, orphan) => {
        await openOutputBands(OUTPUT_BANDS, {others: [orphan]})

        expect(tooltipsOf(orphan)).toEqual([expect.stringContaining('process.bandMath.requirement.missingImage')])
        expect(addBandButtons()).toHaveLength(1)
    })

    it('can be removed, and the rest applied', async () => {
        await openOutputBands(OUTPUT_BANDS, {others: [ORPHANED_CALCULATION]})

        await removeImage(ORPHANED_CALCULATION)
        await type(rowOf(CURRENT_COPY), 'renamed')
        await apply()

        expect(savedImageIds()).toEqual([INPUT.imageId])
        expect(savedCopies()).toEqual([LEGACY_COPY, {...CURRENT_COPY, outputName: 'renamed'}])
    })

    it('is kept when the panel is cancelled after removing it', async () => {
        await openOutputBands(OUTPUT_BANDS, {others: [ORPHANED_CALCULATION]})

        await removeImage(ORPHANED_CALCULATION)
        await cancel()

        expect(savedImageIds()).toEqual([INPUT.imageId, ORPHANED_CALCULATION.imageId])
    })
})

describe('an output image', () => {
    it('cannot be applied without bands once its last is removed', async () => {
        await openOutputBands([LEGACY_COPY])

        await remove(rowOf(LEGACY_COPY))

        expect(applyEnabled()).toBe(false)
    })

    it('is not offered a band a saved recipe outputs under a legacy id', async () => {
        await openOutputBands([{...VV, defaultOutputName: 'VV'}, LEGACY_COPY, {...VH, defaultOutputName: 'VH'}])

        await openBandPicker()

        expect(offered()).toEqual([NIR.name])
    })

    it('is offered a band whose name only the output of another of its bands has', async () => {
        const vvOutputAsVH = {...VV, name: VH.name, defaultOutputName: 'VH'}
        await openOutputBands([vvOutputAsVH, CURRENT_COPY, {...NIR, defaultOutputName: 'nir'}])

        await openBandPicker()

        expect(offered()).toEqual([VH.name])
    })
})

describe('an output image whose input no longer includes a band', () => {
    it('is not offered it once Sync has removed its outputs', async () => {
        const input = removedFromInput(RATIO)
        const changes = findChanges({prevImages: [INPUT], images: [input], prevCalculations: [], calculations: []})
        const [{outputBands}] = updateOutputBands({changes, outputImages: [{...INPUT, outputBands: OUTPUT_BANDS}]})
        await openOutputBands(outputBands, {input})

        await openBandPicker()

        expect(offered()).toEqual([NIR.name])
    })

    it('is given by Add all only the bands its input includes now', async () => {
        await openOutputBands([{...VV, defaultOutputName: 'VV'}], {input: removedFromInput(RATIO)})

        await addBand(ADD_ALL)
        await apply()

        expect(savedOutputNames()).toEqual([VV.name, VH.name, NIR.name])
    })

    it('is offered a same-named band that replaced one it still outputs', async () => {
        const replacement = {...RATIO, id: 'replacement-ratio-id'}
        const input = {...INPUT, includedBands: [VV, VH, replacement, NIR]}
        await openOutputBands([{...VV, defaultOutputName: 'VV'}, CURRENT_COPY, {...VH, defaultOutputName: 'VH'}, {...NIR, defaultOutputName: 'nir'}], {input})

        await openBandPicker()

        expect(offered()).toEqual([RATIO.name])
    })
})

// Its input as configured now, the band both copies are taken from no longer included: a saved output image's own copy of
// the input's bands still lists it.
const removedFromInput = band => ({...INPUT, includedBands: INPUT.includedBands.filter(({id}) => id !== band.id)})

const VV = {id: 'vv-id', name: 'VV', type: 'continuous', legendEntries: []}
const VH = {id: 'vh-id', name: 'VH', type: 'continuous', legendEntries: []}
const RATIO = {id: 'ratio-id', name: 'ratio_VV_VH', type: 'continuous', legendEntries: []}
const NIR = {id: 'nir-id', name: 'nir', type: 'continuous', legendEntries: []}
const INPUT = {imageId: 'input-1', name: 'i1', type: 'ASSET', id: 'users/x/radar', includedBands: [VV, VH, RATIO, NIR]}

const LEGACY_COPY = {...RATIO, id: 'legacy-ratio-id', defaultOutputName: 'ratio_VV_VH'}
const CURRENT_COPY = {...RATIO, defaultOutputName: 'ratio_VV_VH_1'}

const OUTPUT_BANDS = [{...VV, defaultOutputName: 'VV'}, LEGACY_COPY, {...VH, defaultOutputName: 'VH'}, CURRENT_COPY]

// Outputs saved from images since removed: a calculation, and an input selecting a recipe.
const ORPHANED_CALCULATION = {
    imageId: 'calc-9', name: 'gone', type: 'EXPRESSION', expression: 'i1.VV * 2', includedBands: [{id: 'g-id', name: 'g'}],
    outputBands: [{id: 'g-id', name: 'g', defaultOutputName: 'g'}]
}
const ORPHANED_RECIPE_INPUT = {
    imageId: 'input-9', name: 'i9', type: 'RECIPE_REF', id: 'recipe-gone', includedBands: [{id: 'r-id', name: 'r'}],
    outputBands: [{id: 'r-id', name: 'r', defaultOutputName: 'r'}]
}

const sessionState = (outputBands, {others = [], input = INPUT} = {}) => ({
    process: {
        loadedRecipes: {
            [ID]: {
                id: ID, type: 'BAND_MATH', revision: 1,
                model: {
                    inputImagery: {images: [input]},
                    calculations: {calculations: []},
                    outputBands: {outputImages: [{...INPUT, outputBands}, ...others]}
                },
                ui: {initialized: true}
            }
        },
        recipes: [{id: ID, name: 'Band math', type: 'BAND_MATH', revision: 1}],
        saveStates: {},
        tabs: [{id: ID}]
    },
    dimensions: {width: 1024, height: 768}
})

const openOutputBands = async (outputBands = OUTPUT_BANDS, configuration) => {
    const initialState = sessionState(outputBands, configuration)
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <Recipe id={ID}>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <OutputBands/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await settled()
}

// The rows of the band both copies are taken from, in the order listed.
const rows = () => [...document.querySelectorAll(`[data-label="${RATIO.name}"]`)]

const rowOf = copy => rows().find(row => placeholder(row) === copy.defaultOutputName)

const placeholder = row => row.querySelector('input').placeholder

const value = row => row.querySelector('input').value

// A row's remove button, pressed as a user presses it.
const remove = async row => {
    const button = row.querySelector('button')
    await act(async () => {
        button.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
        button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
        button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}))
    })
    await settled()
}

const type = async (row, text) => {
    const input = row.querySelector('input')
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

// The bands an output image can still be given, as its "+" offers them.
const openBandPicker = async () => {
    await act(async () => document.querySelector('svg[data-icon="plus"]').closest('button').click())
    await settled()
}

const addBand = async name => {
    await openBandPicker()
    await act(async () => option(name).click())
    await settled()
}

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const option = label => options().find(element => element.textContent === label)

const offered = () => options().map(element => element.textContent)

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const applyEnabled = () => panelButton('button.apply')?.disabled === false

const apply = async () => {
    await act(async () => panelButton('button.apply').click())
    await settled()
}

const cancel = async () => {
    await act(async () => panelButton('button.cancel').click())
    await settled()
}

const savedCopies = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.outputBands.outputImages'])
    .flatMap(({outputBands}) => outputBands)
    .filter(({name}) => name === RATIO.name)

// The header of an output image's entry, known by the image's name.
const headerOf = ({name}) => [...document.querySelectorAll('svg[data-icon="trash"]')]
    .map(icon => ancestors(icon).find(element => element.textContent.includes(name)
        && element.querySelectorAll('svg[data-icon="trash"]').length === 1))
    .find(Boolean)

const ancestors = element => element.parentElement ? [element.parentElement, ...ancestors(element.parentElement)] : []

const tooltipsOf = image => [...headerOf(image).querySelectorAll('[data-tooltip]')]
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .filter(line => line.startsWith('process.bandMath.requirement'))

const addBandButtons = () => [...document.querySelectorAll('svg[data-icon="plus"]')]
    .filter(icon => !icon.closest('button').textContent.includes('process.bandMath.panel.outputBands.addImage.label'))

// An output image's remove button, pressed as a user presses it.
const removeImage = async image => {
    const button = headerOf(image).querySelector('svg[data-icon="trash"]').closest('button')
    await act(async () => {
        button.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
        button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
        button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}))
    })
    await settled()
}

const savedOutputNames = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.outputBands.outputImages'])
    .flatMap(({outputBands}) => outputBands)
    .map(({name}) => name)

const savedImageIds = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.outputBands.outputImages'])
    .map(({imageId}) => imageId)

const settled = () => act(async () => {})
