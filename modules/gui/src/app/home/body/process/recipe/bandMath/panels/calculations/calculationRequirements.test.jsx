import {EditorView} from '@codemirror/view'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Calculations as their list and panel show them, judged by what Band Math needs of its configuration as applied, with
// the sync that keeps the rest of the recipe following them, as the Band Math editor composes them, over a real store.

vi.mock('~/apiRegistry', async () => {
    const {NEVER} = await import('rxjs')
    return {default: {recipe: {save$: () => NEVER, load$: () => NEVER}}}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// The panel is open for the calculation it was activated with, if any, and closes as it does when applied or cancelled.
const activation = vi.hoisted(() => ({imageId: null}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [active, setActive] = useState(id !== 'calculation' || Boolean(activation.imageId))
            return active
                ? <Component {...props} activatable={{active, imageId: activation.imageId, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})
// What the list's actions open is not what this exercises.
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{activatables: {}}}/>
}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('../../bandMath')
const {Calculation} = await import('./calculation')
const {Calculations} = await import('./calculations')
const {Sync} = await import('../../sync/sync')
const {sourceProblemsOfState} = await import('../../../selectedSourceStatus')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(bandMath())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('the list of calculations', () => {
    it('marks each calculation that needs attention, saying why, a calculation held by another by naming it', async () => {
        await open(null, {calculations: [
            expression('calc-1', 'a', 'i1.swir'), expression('calc-2', 'b', 'a.a + 1'), expression('calc-3', 'c', 'i1.red')
        ]}, <Calculations/>)

        expect(listTooltips()).toEqual([
            [expect.stringContaining('process.bandMath.requirement.unknownBand')],
            [expect.stringContaining('process.requirement.prerequisiteUnmet')]
        ])
        expect(listTooltips()[1][0]).toContain('a')
    })
})

describe('a calculation edited in its panel', () => {
    it('can be repaired while another stays unmet, which still marks Calculations', async () => {
        await open('calc-2', {calculations: [expression('calc-1', 'a', 'i1.swir'), expression('calc-2', 'b', 'i1.nir')]})

        await typeExpression('i1.red * 2')
        await apply()

        expect(calculation('calc-2').expression).toBe('i1.red * 2')
        expect(Object.keys(sourceProblems())).toEqual(['calculations'])
    })

    // What Band Math needs of its configuration judges what was applied; the panel's Apply stays the panel's.
    it('is applied as before while it reads a calculation that is unmet', async () => {
        await open('calc-2', {calculations: [expression('calc-1', 'a', 'i1.swir'), expression('calc-2', 'b', 'a.a + 1')]})

        await typeExpression('a.a + 2')
        await apply()

        expect(calculation('calc-2').expression).toBe('a.a + 2')
    })
})

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const INPUT = {imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR]}
// Output as configured, so only the calculations need attention.
const OUTPUT = {imageId: INPUT.imageId, outputBands: [{...RED, defaultOutputName: 'red'}]}

function expression(imageId, name, text) {
    return {
        imageId, name, type: 'EXPRESSION', expression: text, dataType: 'auto', bandRenameStrategy: 'SUFFIX',
        usedBands: [], includedBands: [{id: `${imageId}-band`, name}]
    }
}

const sessionState = ({images, calculations}) => ({
    process: {
        loadedRecipes: {
            [ID]: {
                id: ID, type: 'BAND_MATH', revision: 1,
                model: {inputImagery: {images}, calculations: {calculations}, outputBands: {outputImages: [OUTPUT]}},
                ui: {initialized: true}
            }
        },
        recipes: [{id: ID, name: 'Band math', type: 'BAND_MATH', revision: 1}],
        saveStates: {},
        tabs: [{id: ID}]
    },
    dimensions: {width: 1024, height: 768}
})

async function open(imageId, {images = [INPUT], calculations = []}, panel = <Calculation/>) {
    activation.imageId = imageId
    const initialState = sessionState({images, calculations})
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
                        {panel}
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await linted()
}

// The expression replaced, as typing it does, and checked.
async function typeExpression(text) {
    await act(async () => {
        const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
        view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}, userEvent: 'input.type'})
    })
    await linted()
}

// The editor lints a moment after an edit.
function linted() {
    return act(() => new Promise(resolve => setTimeout(resolve, 10)))
}

async function apply() {
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'button.apply').click())
    await linted()
}

// What the list's items say of themselves, where they say anything.
function listTooltips() {
    return [...document.querySelectorAll('[data-tooltip]')]
        .map(element => JSON.parse(element.dataset.tooltip))
        .filter(lines => lines.some(line => line.startsWith('process.bandMath.requirement') || line.startsWith('process.requirement')))
}

function calculation(imageId) {
    return selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.calculations.calculations'])
        .find(calculation => calculation.imageId === imageId)
}

function sourceProblems() {
    return sourceProblemsOfState(store.getState(), ID)
}
