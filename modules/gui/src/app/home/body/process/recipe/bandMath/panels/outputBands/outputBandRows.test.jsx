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

const {OutputBands} = await import('./outputBands')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'

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

const VV = {id: 'vv-id', name: 'VV', type: 'continuous', legendEntries: []}
const VH = {id: 'vh-id', name: 'VH', type: 'continuous', legendEntries: []}
const RATIO = {id: 'ratio-id', name: 'ratio_VV_VH', type: 'continuous', legendEntries: []}
const NIR = {id: 'nir-id', name: 'nir', type: 'continuous', legendEntries: []}
const INPUT = {imageId: 'input-1', name: 'i1', type: 'ASSET', id: 'users/x/radar', includedBands: [VV, VH, RATIO, NIR]}

const LEGACY_COPY = {...RATIO, id: 'legacy-ratio-id', defaultOutputName: 'ratio_VV_VH'}
const CURRENT_COPY = {...RATIO, defaultOutputName: 'ratio_VV_VH_1'}

const OUTPUT_BANDS = [{...VV, defaultOutputName: 'VV'}, LEGACY_COPY, {...VH, defaultOutputName: 'VH'}, CURRENT_COPY]

const sessionState = outputBands => ({
    process: {
        loadedRecipes: {
            [ID]: {
                id: ID, type: 'BAND_MATH', revision: 1,
                model: {
                    inputImagery: {images: [INPUT]},
                    calculations: {calculations: []},
                    outputBands: {outputImages: [{...INPUT, outputBands}]}
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

const openOutputBands = async (outputBands = OUTPUT_BANDS) => {
    const initialState = sessionState(outputBands)
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

const settled = () => act(async () => {})
