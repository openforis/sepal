import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Closing an unsaved recipe while another recipe's set-up wizard is left open in a tab not shown, through the real
// process tabs, close and save dialogs, activation and the wizard's recipe form panel. The dialog about the recipe being
// closed is that recipe's: the other recipe's wizard, holding its own panels open, neither keeps it from opening nor is
// changed by it. Recipe types stand in for Masking and Optical Mosaic; their contents are not what is tested.

vi.mock('~/apiRegistry', () => ({default: {
    recipe: {loadAll$: () => of([]), save$: () => NEVER, load$: () => NEVER},
    project: {loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
// Loading the recipe modules closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('./processMenu', () => ({ProcessMenu: () => null}))
vi.mock('./recipeImageLayers', () => ({registerRecipeImageLayers: () => {}}))
vi.mock('./imageLayerSources', () => ({registerImageLayerSources: () => {}}))
const types = vi.hoisted(() => ({}))
vi.mock('./recipeTypes', async () => {
    const {addRecipeType} = await import('./recipeTypeRegistry')
    return {registerRecipeTypes: () => {
        addRecipeType({id: 'WIZARD', labels: {name: 'Wizard'}, imageSource: false, components: {recipe: types.WizardRecipe}, sourceRequirements: []})
        addRecipeType({id: 'SET_UP', labels: {name: 'Set up'}, imageSource: false, components: {recipe: types.SetUpRecipe}, sourceRequirements: []})
    }}
})

Object.assign(types, await import('./closeRecipe.test.fixtures'))
const {Process} = await import('./process')
const {ActivationContext} = await import('~/widget/activation/activationContext')
const {PortalContainer} = await import('~/widget/portal')
const {EventShield} = await import('~/widget/eventShield')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('closing an unsaved recipe while another recipe\'s set-up wizard is left open', () => {
    it('opens its dialog at once, the wizard keeping its step and draft', async () => {
        await openWithWizardDraft()

        await closeTab(OPTICAL)

        expect(dialogOpen()).toBe(true)
        expect(wizardDraft()).toBe(DRAFT)
    })

    it('keeps the recipe open on Cancel, the wizard as it was', async () => {
        await openWithWizardDraft()
        await closeTab(OPTICAL)

        await press('button.cancel')

        expect(dialogOpen()).toBe(false)
        expect(tabIds()).toEqual([MASKING, OPTICAL])
        expect(wizardDraft()).toBe(DRAFT)
    })

    it('closes the recipe without saving on Don\'t save, the wizard as it was', async () => {
        await openWithWizardDraft()
        await closeTab(OPTICAL)

        await press('button.discard')

        expect(dialogOpen()).toBe(false)
        expect(tabIds()).toEqual([MASKING])
        expect(wizardDraft()).toBe(DRAFT)
    })

    // A panel holding an edit is not given way to, whatever asks.
    it('is not opened over a panel of the recipe closed holding an edit, which stays as edited', async () => {
        await openWithWizardDraft()
        await press('open settings')
        await typeInto(settingsInput(), 'edited')

        await closeTab(OPTICAL)

        expect(dialogOpen()).toBe(false)
        expect(settingsInput().value).toBe('edited')
    })

    it('goes on to save the recipe on Save, the wizard as it was', async () => {
        await openWithWizardDraft()
        await closeTab(OPTICAL)

        await press('button.save')

        expect(dialogOpen()).toBe(false)
        expect(document.body.textContent).toContain('process.saveRecipe.title')
        expect(tabIds()).toEqual([MASKING, OPTICAL])
        expect(wizardDraft()).toBe(DRAFT)
    })
})

const MASKING = 'masking-1'
const OPTICAL = 'optical-1'
const DRAFT = 'half-typed'

// A new Masking, its wizard's first step given a draft it has not applied, and then a new Optical Mosaic set up and
// shown, not saved.
async function openWithWizardDraft() {
    await open({
        tabs: [{id: MASKING, type: 'WIZARD', title: 'Masking'}, {id: OPTICAL, type: 'SET_UP', title: 'Optical'}],
        selectedTabId: MASKING,
        loadedRecipes: {
            [MASKING]: {id: MASKING, type: 'WIZARD', title: 'Masking', model: {}, ui: {initialized: false}},
            [OPTICAL]: {id: OPTICAL, type: 'SET_UP', title: 'Optical', model: {}, ui: {initialized: true, unsaved: true}}
        }
    })
    await typeInto(stepInput(), DRAFT)
    await selectTab(OPTICAL)
}

async function open(process) {
    const initialState = {
        user: {currentUser: {username: 'user'}},
        process: {...process, recipes: [], projects: [], recipeListing: {checkedAt: Date.now()}, saveStates: {}},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <EventShield>
                    <PortalContainer/>
                    <Process projects={[]} recipes={[]}/>
                </EventShield>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

async function selectTab(id) {
    await act(async () => store.dispatch({
        type: 'SELECT_TAB',
        reduce: state => ({...state, process: {...state.process, selectedTabId: id}})
    }))
    await settled()
}

// A tab's close button pressed.
async function closeTab(id) {
    const title = store.getState().process.tabs.find(tab => tab.id === id).title
    const titleInput = [...document.querySelectorAll('input')].find(input => input.value === title)
    await click(titleInput.parentElement.closest('div:has(> button)').querySelector(':scope > button'))
}

async function press(label) {
    await click([...document.querySelectorAll('button')].find(button => button.textContent.includes(label)))
}

async function typeInto(input, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function click(element) {
    expect(element).toBeDefined()
    await act(async () => element.click())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const tabIds = () => store.getState().process.tabs.map(({id}) => id)

const dialogOpen = () => document.body.textContent.includes('process.closeRecipe.message')

const stepInput = () => document.querySelector('[data-label="step.name"] input')

const settingsInput = () => document.querySelector('[data-label="settings.name"] input')

// What the wizard's step holds, unapplied: its panel's input, kept while its tab is not shown.
const wizardDraft = () => stepInput()?.value ?? selectFrom(store.getState(), ['process.loadedRecipes', MASKING, 'ui', 'step', 'name'])
