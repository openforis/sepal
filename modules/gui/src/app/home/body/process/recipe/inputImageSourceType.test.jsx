import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'
import {EventShield} from '~/widget/eventShield'
import {withForm} from '~/widget/form/form'

// Masking's and Index Change's and Class Change's image inputs: a new input - its model section absent - starts as an
// asset, a saved one keeps its type, either opening unedited with that one kind chosen beside its picker; choosing the
// other type in the input's label row replaces the input and clears what was selected or read for the previous one. The asset and recipe pickers are replaced by ones that show their label buttons, and Class
// Change's legend editor, which needs a panel activation context, by nothing.

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children}) => <>{children}</>,
    recipeFormPanel: () => Component => Component
}))
vi.mock('~/widget/form/panelButtons', () => ({FormPanelButtons: () => null}))
vi.mock('~/widget/form/assetCombo', () => ({
    FormAssetCombo: ({labelButtons}) => <div data-picker='asset'>{labelButtons}</div>
}))
vi.mock('~/widget/legend/legend', () => ({Legend: () => null}))
vi.mock('~/widget/recipeInput', () => ({
    RecipeInput: ({labelButtons}) => <div data-picker='recipe'>{labelButtons}</div>
}))

const masking = await import('./masking/panels/inputImage/inputImage')
const indexChange = await import('./indexChange/panels/inputImage/inputImage')
const classChange = await import('./classChange/panels/inputImage/inputImage')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['Masking', masking, {bands: undefined}],
    ['Index Change', indexChange, {bands: undefined, band: undefined}],
    ['Class Change', classChange, {bands: {}, band: undefined, legendEntries: undefined}]
])('%s\'s image input', (_panel, panel, cleared) => {
    it('opens a new input on an asset, that kind alone chosen, unedited', async () => {
        await open(panel)

        expect(picker()).toBe('asset')
        expect(chosenKinds()).toEqual(['process.sourceType.ASSET'])
        expect(form().isDirty()).toBe(false)
    })

    it('opens a saved recipe input on its recipe, that kind alone chosen, unedited', async () => {
        await open(panel, {values: panel.modelToValues({type: 'RECIPE_REF', id: 'recipe-1'})})

        expect(picker()).toBe('recipe')
        expect(chosenKinds()).toEqual(['process.sourceType.RECIPE'])
        expect(form().isDirty()).toBe(false)
    })

    it('offers the other type in the input\'s label row, and choosing it starts the input over', async () => {
        const inputs = await open(panel, {edits: {section: 'ASSET', asset: 'users/me/image', bands: ['red'], band: 'red', metadata: {}, visualizations: [], legendEntries: []}})
        expect(picker()).toBe('asset')

        await act(async () => typeButton('process.sourceType.RECIPE').click())

        expect(picker()).toBe('recipe')
        expect(inputs().section.value).toBe('RECIPE_REF')
        expect(values(inputs(), ['asset', 'recipe', 'metadata', 'visualizations', ...Object.keys(cleared)]))
            .toEqual({asset: undefined, recipe: undefined, metadata: undefined, visualizations: undefined, ...cleared})
    })
})

// The panel over the values it opens with, edited as given.
const open = async (panel, {values = {}, edits = {}} = {}) => {
    let inputs
    const Host = withForm({fields: panel.fields})(props => {
        inputs = props.inputs
        openForm = props.form
        return <panel.InputImage {...props} title='Image' recipeActionBuilder={() => ({})}/>
    })
    const store = createStore((state = {dimensions: {width: 1024, height: 768}, process: {recipes: []}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}><EventShield><Host values={values}/></EventShield></Provider>))
    await act(async () => Object.entries(edits).forEach(([name, value]) => inputs[name]?.set(value)))
    return () => inputs
}

let openForm

const form = () => openForm

// The kinds chosen beside the picker.
const chosenKinds = () => [...container.querySelectorAll('[data-picker] button')]
    .filter(button => button.classList.contains(lookStyles.highlight))
    .map(button => button.textContent)

const picker = () => container.querySelector('[data-picker]')?.dataset.picker

const typeButton = label => [...container.querySelectorAll('[data-picker] button')]
    .find(button => button.textContent === label)

const values = (inputs, names) => Object.fromEntries(names.map(name => [name, inputs[name].value]))
