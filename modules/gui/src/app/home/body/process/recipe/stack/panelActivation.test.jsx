import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'

// Which of the Stack editor's panels its toolbar opens, and when one gives way to another: the real toolbar, panels
// and activation over a real store. A panel holding unapplied edits keeps the others closed until it is applied or
// cancelled; an unedited one gives way. Earth Engine never answers; nothing here needs it to.

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

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: stack} = await import('./stack')
const {StackToolbar} = await import('./panels/stackToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(stack())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'stack-1'
const LISTING = [{id: ID, name: 'Stack', type: 'STACK', revision: 1}]
const ASSET = 'users/x/a'

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('Band names, unedited', () => {
    it('gives way to Input imagery', async () => {
        await open()
        await press(BAND_NAMES)

        await press(INPUT_IMAGERY)

        expect(openPanels()).toEqual([INPUT_IMAGERY])
    })

    it('opens from Input imagery, which gives way to it', async () => {
        await open()
        await press(INPUT_IMAGERY)

        await press(BAND_NAMES)

        expect(openPanels()).toEqual([BAND_NAMES])
    })
})

describe('Band names holding an edit', () => {
    it('keeps Input imagery closed', async () => {
        await open()
        await press(BAND_NAMES)

        await typeName('elevation')

        expect(canOpen(INPUT_IMAGERY)).toBe(false)
        await press(INPUT_IMAGERY)
        expect(openPanels()).toEqual([BAND_NAMES])
        expect(nameField().value).toBe('elevation')
    })

    it.each(['button.apply', 'button.cancel'])('lets Input imagery open once %s is pressed', async panelAction => {
        await open()
        await press(BAND_NAMES)
        await typeName('elevation')

        await press(panelAction)

        expect(canOpen(INPUT_IMAGERY)).toBe(true)
        await press(INPUT_IMAGERY)
        expect(openPanels()).toEqual([INPUT_IMAGERY])
    })
})

describe('an input editor holding an edit', () => {
    it('keeps Band names closed, the edit kept', async () => {
        await open()
        await press(INPUT_IMAGERY)
        await editInput()

        await chooseSection(ASSET_SECTION, 'process.panels.inputImagery.recipe.title')
        expect(editorShowing()).toBe(RECIPE_SECTION)
        expect(panelButton('button.apply')).toBeDefined()

        expect(canOpen(BAND_NAMES)).toBe(false)
        await press(BAND_NAMES)
        expect(editorShowing()).toBe(RECIPE_SECTION)
        expect(panelButton('button.apply')).toBeDefined()
    })
})

const INPUT_IMAGERY = 'process.panels.inputImagery.button'
const ASSET_SECTION = 'EARTH ENGINE ASSET'
const RECIPE_SECTION = 'SEPAL RECIPE'
const BAND_NAMES = 'process.stack.panel.bandNames.button'

// What each toolbar button's panel shows as its title, for telling which are open.
const TITLES = {
    [INPUT_IMAGERY]: 'process.panels.inputImagery.title',
    [BAND_NAMES]: 'process.stack.panel.bandNames.title'
}

const recipe = () => ({
    id: ID,
    type: 'STACK',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: ASSET, includedBands: [{id: 'i-1-red', band: 'red'}]}]},
        bandNames: {bandNames: [{imageId: 'i-1', bands: [{id: 'i-1-red', originalName: 'red', outputName: 'red'}]}]}
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
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ID}>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <StackToolbar/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
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

// Another kind of source chosen for the input being edited, from the one it shows.
async function chooseSection(current, label) {
    await press(current)
    await act(async () => [...document.querySelectorAll('[data-hook="option"]')].find(option => option.textContent.includes(label)).click())
    await settled()
}

async function typeName(name) {
    const field = nameField()
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, name)
        field.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

const canOpen = label => !panelButton(label).disabled

const openPanels = () => Object.keys(TITLES).filter(label => document.body.textContent.includes(TITLES[label]))

// The kind of source the input editor shows, if it is open.
const editorShowing = () => [ASSET_SECTION, RECIPE_SECTION].find(section => panelButton(section))

const nameField = () => document.querySelector('input')
