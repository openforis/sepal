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

// The legend of a Classification and of an Index Change, as each editor's real toolbar, panels and activation show it
// over a real store: a saved legend opens unedited and gives way to another panel; an edited one keeps the others
// closed until it is applied or cancelled, and an invalid one cannot be applied. Earth Engine never answers.

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => NEVER,
        assetMetadata$: () => NEVER,
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification/classification')
const {getDefaultModel: classificationModel} = await import('./classification/classificationRecipe')
const {ClassificationToolbar} = await import('./classification/panels/classificationToolbar')
const {default: indexChange} = await import('./indexChange/indexChange')
const {defaultModel: indexChangeModel} = await import('./indexChange/indexChangeRecipe')
const {IndexChangeToolbar} = await import('./indexChange/panels/indexChangeToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(classification())
addRecipeType(indexChange())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LEGEND = [
    {id: 'l-1', color: '#00ff00', value: 1, label: 'Forest'},
    {id: 'l-2', color: '#0000ff', value: 2, label: 'Water'}
]

// Each editor, with the legend's button and title, and another panel's, to tell which is open.
const EDITORS = [
    {
        type: 'CLASSIFICATION',
        model: () => ({...classificationModel(), inputImagery: {images: []}, legend: {entries: LEGEND}}),
        toolbar: () => <ClassificationToolbar dataCollectionManager={{updateAll: () => {}}}/>,
        legend: {button: 'process.classification.panel.legend.button', title: 'process.classification.panel.legend.title'},
        other: {button: 'process.classification.panel.classifier.button', title: 'process.classification.panel.classifier.title'}
    },
    {
        type: 'INDEX_CHANGE',
        model: () => ({...indexChangeModel, legend: {entries: LEGEND}}),
        toolbar: () => <IndexChangeToolbar/>,
        legend: {button: 'process.indexChange.panel.legend.button.label', title: 'process.indexChange.panel.legend.title'},
        other: {button: 'process.indexChange.panel.options.button.label', title: 'process.indexChange.panel.options.title'}
    }
]

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each(EDITORS)('the legend of $type', editor => {
    it('opens unedited, offering Close rather than Apply, and gives way to another panel', async () => {
        await open(editor)
        await press(editor.legend.button)

        expect(panelButton('button.apply')).toBeUndefined()
        expect(panelButton('button.close')).toBeDefined()

        await press(editor.other.button)
        expect(openPanels(editor)).toEqual(['other'])
    })

    it('keeps another panel closed while edited, the edit kept', async () => {
        await open(editor)
        await press(editor.legend.button)

        await typeInto(labelField('Water'), 'Lake')

        expect(panelButton(editor.other.button).disabled).toBe(true)
        await press(editor.other.button)
        expect(openPanels(editor)).toEqual(['legend'])
        expect(labelField('Lake')).toBeDefined()
    })

    it.each(['button.apply', 'button.cancel'])('lets another panel open once %s is pressed', async panelAction => {
        await open(editor)
        await press(editor.legend.button)
        await typeInto(labelField('Water'), 'Lake')

        await press(panelAction)

        await press(editor.other.button)
        expect(openPanels(editor)).toEqual(['other'])
    })

    it('refuses an entry taking another\'s label, which cannot be applied', async () => {
        await open(editor)
        await press(editor.legend.button)

        await typeInto(labelField('Water'), 'Forest')

        expect(labelsInError()).toEqual(['Forest', 'Forest'])
        expect(panelButton('button.apply').disabled).toBe(true)
    })
})

async function open(editor) {
    const id = 'recipe-1'
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[id]: {id, type: editor.type, revision: 1, ui: {initialized: true}, model: editor.model()}},
            recipes: [{id, name: 'Recipe', type: editor.type, revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id}]
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
            <ActivationContext id='root'>
                <SourceRuntimeProvider>
                    <Recipe id={id}>
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                {editor.toolbar()}
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

const openPanels = editor => ['legend', 'other'].filter(panel => document.body.textContent.includes(editor[panel].title))

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
