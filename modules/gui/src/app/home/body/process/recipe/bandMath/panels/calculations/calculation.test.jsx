import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// A calculation edited in its panel, with the sync that keeps the output bands following it, as the Band Math editor
// composes them, over a real store.

// Storage never answers: what is saved is not the concern here.
vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The panel is open for the calculation it was activated with, and closes as it does when applied.
const activation = vi.hoisted(() => ({imageId: null}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: () => Component => props => {
            const [active, setActive] = useState(true)
            return active
                ? <Component {...props} activatable={{active, imageId: activation.imageId, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})

const {Calculation, updateIncludedBands} = await import('./calculation')
const {Sync} = await import('../../sync/sync')
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

describe('a FUNCTION calculation edited in its panel', () => {
    it('keeps the identity of its band, and so the name its output was given', async () => {
        await editCalculation(MAXIMUM)

        await type(CALCULATION_NAME, 'highest')
        await apply()

        expect(calculation().includedBands.map(({id}) => id)).toEqual([MAXIMUM_BAND.id])
        expect(outputBand()).toMatchObject({id: MAXIMUM_BAND.id, outputName: 'peak'})
    })

    it('renames the output it is taken from when its band is renamed, keeping the name it is output under', async () => {
        await editCalculation(MAXIMUM)

        await type(BAND_NAME, 'brightest')
        await apply()

        expect(outputBand()).toMatchObject({id: MAXIMUM_BAND.id, name: 'brightest', defaultOutputName: 'brightest', outputName: 'peak'})
    })
})

describe('the band of a new FUNCTION calculation', () => {
    it('has an identity of its own', () => {
        const values = {section: 'FUNCTION', imageId: 'calc-2', name: 'c2', includedBands: '', defaultBandName: 'min'}

        const [first] = updateIncludedBands(values)
        const [second] = updateIncludedBands(values)

        expect(first.id).toEqual(expect.any(String))
        expect(second.id).not.toBe(first.id)
    })
})

const CALCULATION_NAME = 'process.bandMath.panel.calculations.form.calculationName.label'
const BAND_NAME = 'process.bandMath.panel.calculations.form.bandName.label'

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const INPUT = {imageId: 'input-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR]}

const MAXIMUM_BAND = {id: 'max-id', imageId: 'calc-1', imageName: 'c1', name: 'max', type: 'continuous', legendEntries: []}
const MAXIMUM = {
    imageId: 'calc-1', name: 'c1', type: 'FUNCTION', reducer: 'max', dataType: 'auto',
    usedBands: [RED, NIR].map(band => ({...band, imageId: INPUT.imageId, imageName: INPUT.name})),
    includedBands: [MAXIMUM_BAND]
}

const sessionState = calculation => ({
    process: {
        loadedRecipes: {
            [ID]: {
                id: ID, type: 'BAND_MATH', revision: 1,
                model: {
                    inputImagery: {images: [INPUT]},
                    calculations: {calculations: [calculation]},
                    outputBands: {outputImages: [{...calculation, outputBands: [{...MAXIMUM_BAND, defaultOutputName: 'max', outputName: 'peak'}]}]}
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

const editCalculation = async calculation => {
    activation.imageId = calculation.imageId
    const initialState = sessionState(calculation)
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <Recipe id={ID}>
                <Sync/>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <Calculation/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await settled()
}

const type = async (label, text) => {
    const input = document.querySelector(`[data-label="${label}"] input`)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
}

const apply = async () => {
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'button.apply').click())
    await settled()
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const calculation = () => model().calculations.calculations[0]

const outputBand = () => model().outputBands.outputImages[0].outputBands[0]

const settled = () => act(async () => {})
