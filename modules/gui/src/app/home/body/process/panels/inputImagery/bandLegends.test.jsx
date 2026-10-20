import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'

// Two categorical bands of a Remapping input, their legends shown at once in the input editor Stack and Remapping share,
// each edited in the legend widget's own editor, over the real toolbar, panels and activation of a real store. Earth Engine
// never answers.

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => NEVER,
        assetMetadata$: () => NEVER,
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('~/app/home/body/process/recipe/remapping/remapping')
const {RemappingToolbar} = await import('~/app/home/body/process/recipe/remapping/panels/remappingToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(remapping())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'remapping-1'
const LISTING = [{id: ID, name: 'Remapping', type: 'REMAPPING', revision: 1}]
const ASSET = 'users/x/a'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('two categorical bands shown at once', () => {
    it('edit their legends apart, each in an editor of its own', async () => {
        await open()
        await press(INPUT_IMAGERY)
        await editInput()
        expect(legendEditButtons()).toHaveLength(2)

        await act(async () => legendEditButtons()[1].click())
        await settled()

        expect(openLegendEditors()).toBe(1)
        expect(fieldWithValue('one')).toBeUndefined()
        await typeInto(fieldWithValue('five'), 'cover five')
        await applyLegendEditor()
        expect(openLegendEditors()).toBe(0)

        await press('button.apply')
        expect(savedLegends()).toEqual([['one'], ['cover five']])
    })
})

const CLASS = {id: 'i-1-class', band: 'class', type: 'categorical', legendEntries: [{id: 'e-1', color: '#000000', value: 1, label: 'one'}]}
const COVER = {id: 'i-1-cover', band: 'cover', type: 'categorical', legendEntries: [{id: 'e-5', color: '#000000', value: 5, label: 'five'}]}
const LEGEND_EDITOR = 'widget.legend.editLegendPanel.title'

// The buttons editing the legends the input editor shows, in order.
const legendEditButtons = () => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.dataset.tooltip.includes('widget.legend.edit.tooltip'))
    .map(element => element.querySelector('button'))

const openLegendEditors = () => document.body.textContent.split(LEGEND_EDITOR).length - 1

const fieldWithValue = value => [...document.querySelectorAll('input')].find(field => field.value === value)

const savedLegends = () => store.getState().process.loadedRecipes[ID].model.inputImagery.images[0].includedBands
    .map(({legendEntries}) => legendEntries.map(({label}) => label))

const INPUT_IMAGERY = 'process.panels.inputImagery.button'

// A Remapping of one asset input including two categorical bands, each with a legend of one entry.
const recipe = () => ({
    id: ID,
    type: 'REMAPPING',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: [{
            imageId: 'i-1', type: 'ASSET', id: ASSET,
            bands: {class: {values: [1]}, cover: {values: [5]}},
            includedBands: [CLASS, COVER]
        }]},
        legend: {entries: [
            {id: 'l-1', color: '#00ff00', value: 1, label: 'Forest'},
            {id: 'l-2', color: '#0000ff', value: 2, label: 'Water'}
        ]}
    }
})

async function open() {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe()},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            {/* The recipe's activation context nests in the root one, as the app nests it. */}
            <ActivationContext id='root'>
                <SourceRuntimeProvider>
                    <Recipe id={ID}>
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                <RemappingToolbar/>
                            </PortalContext>
                        </EventShield>
                    </Recipe>
                </SourceRuntimeProvider>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

// A button pressed, as a click; a disabled one ignores it.
async function press(label) {
    await act(async () => panelButton(label).click())
    await settled()
}

// The input opened for editing from its row in the Input imagery list.
async function editInput() {
    const row = [...document.querySelectorAll('div')].find(element => element.textContent === ASSET && !element.children.length)
    await act(async () => row.click())
    await settled()
}

async function typeInto(field, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, text)
        field.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

// The legend editor's own Apply pressed: the one in the panel showing the editor's title, not the input editor's.
async function applyLegendEditor() {
    const apply = [...document.querySelectorAll('button')]
        .filter(button => button.textContent.includes('button.apply'))
        .find(button => {
            let element = button
            while (element && !element.textContent.includes(LEGEND_EDITOR)) {
                element = element.parentElement
            }
            return element && !element.textContent.includes('process.panels.inputImagery.sections.title')
        })
    await act(async () => apply.click())
    await settled()
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))
