import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER} from 'rxjs'
import {afterEach, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import {EventShield} from '~/widget/eventShield'
import {PanelWizard} from '~/widget/panelWizard'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Actual list panels and wizard/activation/form machinery. Lists apply their entries separately, so finishing their
// step must not serialize a form over the configured images. No source is read by this navigation.
vi.mock('~/apiRegistry', () => ({default: {recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => NEVER}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: id => ({id, imageSource: true, sourceRequirements: []})}))

const {InputImagery: SharedInputs} = await import('./inputImagery/inputImagery')
const {InputImagery: DerivedInputs} = await import('./inputImageryWithDerived/inputImagery')
const {InputImagery: BandMathInputs} = await import('../recipe/bandMath/panels/inputImagery/inputImagery')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

const PANELS = [['STACK', SharedInputs], ['CLASSIFICATION', DerivedInputs], ['BAND_MATH', BandMathInputs]]
for (const [type, Inputs] of PANELS) {
    it.each(['Done', 'Enter'])(`${type} finishes IMG through %s, closes it and preserves its applied model`, async submission => {
        const {done, model} = await open(type, Inputs)
        expect(button('button.done').disabled).toBe(false)
        if (submission === 'Done') {
            await act(async () => button('button.done').click())
        } else {
            await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        }
        expect(done).toHaveBeenCalledOnce()
        expect(button('button.done')).toBeUndefined()
        expect(store.getState().process.loadedRecipes.recipe.model).toBe(model)
    })
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)
const open = async (type, Inputs) => {
    const image = {imageId: 'i-1', name: 'i1', type: 'ASSET', id: 'users/x/image',
        includedBands: [{id: 'red', name: 'red', band: 'red'}], bandSetSpecs: [{id: 'raw', type: 'IMAGE_BANDS', included: ['red']}]}
    const model = {inputImagery: {images: [image]}, calculations: {calculations: []}, bandNames: {bandNames: []}, outputBands: {outputImages: []}}
    const initial = {dimensions: {width: 1024, height: 768}, process: {
        loadedRecipes: {recipe: {id: 'recipe', type, revision: 1, model, ui: {initialized: false}}},
        recipes: [{id: 'recipe', type, name: 'Recipe', revision: 1}], folders: [], tabs: []
    }}
    store = createStore((state = initial, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const done = vi.fn()
    await act(async () => root.render(<Provider store={store}>
        <PortalContainer/>
        <PortalContainer id='test'/>
        <PortalContext id='test'><EventShield><ActivationContext id='root'>
            <Recipe id='recipe'><PanelWizard panels={['inputImagery']} initialized={false} onDone={done}>
                <Inputs/>
            </PanelWizard></Recipe>
        </ActivationContext></EventShield></PortalContext>
    </Provider>))
    return {done, model}
}
