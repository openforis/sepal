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
import widgetStyles from '~/widget/widget.module.css'

// Which of the Remapping editor's panels its toolbar and set-up wizard open, and when one gives way to another: the
// real toolbar, panels, wizard and activation over a real store. Its Input imagery list is shared with Stack. Earth
// Engine never answers; nothing here needs it to.

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
const {default: remapping} = await import('./remapping')
const {RemappingToolbar} = await import('./panels/remappingToolbar')
// Rendered by the map in the app, beside the toolbar.
const {LegendImport} = await import('~/app/home/map/legendImport')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(remapping())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'remapping-1'
const LISTING = [{id: ID, name: 'Remapping', type: 'REMAPPING', revision: 1}]
const ASSET = 'users/x/a'

let root, container, tree

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('the editor closed and opened again', () => {
    it('opens with no panel open, any of which can be opened', async () => {
        await open()
        await press(BUTTONS.LEGEND)

        await reopen()

        expect(openPanels()).toEqual([])
        await press(BUTTONS.MAPPING)
        expect(openPanels()).toEqual(['MAPPING'])
    })
})

describe('Input imagery, unedited', () => {
    it.each([['Legend', 'LEGEND'], ['Mapping', 'MAPPING']])('gives way to %s', async (_name, panel) => {
        await open()
        await press(INPUT_IMAGERY)

        await press(BUTTONS[panel])

        expect(openPanels()).toEqual([panel])
    })
})

describe('Mapping', () => {
    it.each([['Input imagery', 'INPUT_IMAGERY', INPUT_IMAGERY], ['Legend', 'LEGEND', BUTTONS.LEGEND]])('gives way to %s', async (_name, panel, button) => {
        await open()
        await press(BUTTONS.MAPPING)

        await press(button)

        expect(openPanels()).toEqual([panel])
    })
})

describe('an input editor holding an edit', () => {
    it.each([['Legend', 'LEGEND'], ['Mapping', 'MAPPING']])('keeps %s closed, the edit kept', async (_name, panel) => {
        await open()
        await press(INPUT_IMAGERY)
        await editInput()

        await chooseSection(ASSET_SECTION, 'process.panels.inputImagery.recipe.title')
        expect(canOpen(BUTTONS[panel])).toBe(false)
        await press(BUTTONS[panel])

        expect(openPanels()).toEqual(['INPUT_IMAGERY'])
        expect(editorShowing()).toBe(RECIPE_SECTION)
        expect(panelButton('button.apply')).toBeDefined()
    })
})

describe('the set-up wizard', () => {
    it('opens Input imagery, then Legend and Mapping in turn, and closes when done', async () => {
        await open({initialized: false})
        expect(openPanels()).toEqual(['INPUT_IMAGERY'])

        await press('button.next')
        expect(openPanels()).toEqual(['LEGEND'])

        await press('button.next')
        expect(openPanels()).toEqual(['MAPPING'])

        await press('button.done')
        expect(openPanels()).toEqual([])
    })

    it('goes back a step', async () => {
        await open({initialized: false})
        await press('button.next')

        await press('button.back')

        expect(openPanels()).toEqual(['INPUT_IMAGERY'])
    })
})

describe('a saved legend', () => {
    it('opens unedited, offering Close rather than Apply, and gives way to Input imagery', async () => {
        await open()
        await press(BUTTONS.LEGEND)

        expect(panelButton('button.apply')).toBeUndefined()
        expect(panelButton('button.close')).toBeDefined()

        await press(INPUT_IMAGERY)
        expect(openPanels()).toEqual(['INPUT_IMAGERY'])
    })
})

describe('a legend holding an edit', () => {
    it('keeps Input imagery closed, the edit kept', async () => {
        await open()
        await press(BUTTONS.LEGEND)

        await typeInto(labelField('Water'), 'Lake')

        expect(canOpen(INPUT_IMAGERY)).toBe(false)
        await press(INPUT_IMAGERY)
        expect(openPanels()).toEqual(['LEGEND'])
        expect(labelField('Lake')).toBeDefined()
    })

    it.each(['button.apply', 'button.cancel'])('lets Input imagery open once %s is pressed', async panelAction => {
        await open()
        await press(BUTTONS.LEGEND)
        await typeInto(labelField('Water'), 'Lake')

        await press(panelAction)

        expect(canOpen(INPUT_IMAGERY)).toBe(true)
        await press(INPUT_IMAGERY)
        expect(openPanels()).toEqual(['INPUT_IMAGERY'])
    })

    it('lets a legend be imported, keeping the edit', async () => {
        await open()
        await press(BUTTONS.LEGEND)
        await typeInto(labelField('Water'), 'Lake')

        await importLegend()

        expect(document.body.textContent).toContain('map.legendBuilder.import.title')
        expect(openPanels()).toEqual(['LEGEND'])
        expect(labelField('Lake')).toBeDefined()
    })

    it('refuses an entry taking another\'s label, which cannot be applied', async () => {
        await open()
        await press(BUTTONS.LEGEND)

        await typeInto(labelField('Water'), 'Forest')

        expect(labelsInError()).toEqual(['Forest', 'Forest'])
        expect(panelButton('button.apply').disabled).toBe(true)
    })
})

const INPUT_IMAGERY = 'process.panels.inputImagery.button'
const BUTTONS = {
    LEGEND: 'process.remapping.panel.legend.button',
    MAPPING: 'process.remapping.panel.mapping.button.label'
}
const ASSET_SECTION = 'EARTH ENGINE ASSET'
const RECIPE_SECTION = 'SEPAL RECIPE'

// What each panel shows as its title, for telling which are open.
const TITLES = {
    INPUT_IMAGERY: 'process.panels.inputImagery.title',
    LEGEND: 'process.remapping.panel.legend.title',
    MAPPING: 'process.remapping.panel.mapping.title'
}

// A Remapping of one asset's categorical band to a legend of two classes.
const recipe = ({initialized}) => ({
    id: ID,
    type: 'REMAPPING',
    revision: 1,
    ui: {initialized},
    model: {
        inputImagery: {images: [{
            imageId: 'i-1', type: 'ASSET', id: ASSET,
            includedBands: [{id: 'i-1-class', band: 'class', type: 'categorical', legendEntries: [{id: 'e-1', color: '#000000', value: 1, label: 'one'}]}]
        }]},
        legend: {entries: [
            {id: 'l-1', color: '#00ff00', value: 1, label: 'Forest'},
            {id: 'l-2', color: '#0000ff', value: 2, label: 'Water'}
        ]}
    }
})

async function open({initialized = true} = {}) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe({initialized})},
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
    tree = () =>
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
                                <LegendImport/>
                            </PortalContext>
                        </EventShield>
                    </Recipe>
                </SourceRuntimeProvider>
            </ActivationContext>
        </Provider>
    await act(async () => root.render(tree()))
    await settled()
}

// The editor closed, as closing its recipe does, and opened again over the same session.
async function reopen() {
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(tree()))
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
    await chooseOption(label)
}

// Import chosen from what the legend's Add button offers beside adding an entry, behind its chevron.
async function importLegend() {
    const buttons = [...document.querySelectorAll('button')]
    const chevron = buttons[buttons.indexOf(panelButton('button.add')) + 1]
    await act(async () => chevron.click())
    await settled()
    await chooseOption('map.legendBuilder.load.options.importFromCsv.label')
}

async function chooseOption(label) {
    await act(async () => [...document.querySelectorAll('[data-hook="option"]')].find(option => option.textContent.includes(label)).click())
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

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

const canOpen = label => !panelButton(label).disabled

const openPanels = () => Object.keys(TITLES).filter(panel => document.body.textContent.includes(TITLES[panel]))

// The kind of source the input editor shows, if it is open.
const editorShowing = () => [ASSET_SECTION, RECIPE_SECTION].find(section => panelButton(section))

const labelField = label => [...document.querySelectorAll('input')].find(field => field.value === label)

// The legend's labels whose fields are in their error state.
const labelsInError = () => [...document.querySelectorAll('input[name="label"]')]
    .filter(field => field.closest(`.${classOf(widgetStyles, 'error')}`))
    .map(({value}) => value)

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name]
}
