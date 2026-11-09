import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER} from 'rxjs'
import {afterEach, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import crudItemStyles from '~/widget/crudItem.module.css'
import {EventShield} from '~/widget/eventShield'
import listItemStyles from '~/widget/listItem.module.css'
import {PanelWizard} from '~/widget/panelWizard'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Actual list panels and wizard/activation/form machinery. Lists apply their entries separately, so finishing their
// step must not serialize a form over the configured images, and a list without an image cannot be finished - by its
// buttons, Enter or its form's submission alike. Every configured input is listed, to be edited or removed, whether or
// not the recipe listing holds its source. No source is read by this navigation.
vi.mock('~/apiRegistry', () => ({default: {recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => NEVER}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: id => ({id, imageSource: true, sourceRequirements: []})}))

const {InputImagery: SharedInputs} = await import('./inputImagery/inputImagery')
const {InputImagery: DerivedInputs} = await import('./inputImageryWithDerived/inputImagery')
const {InputImagery: BandMathInputs} = await import('../recipe/bandMath/panels/inputImagery/inputImagery')
const {removeInputImage} = await import('~/app/home/body/process/inputImages')
const {compose} = await import('~/compose')
const {withActivatable} = await import('~/widget/activation/activatable')

// The step after IMG, standing in for a panel: open while the wizard has it as its step.
const NextStep = compose(
    () => <section data-panel='next'/>,
    withActivatable({id: 'next', policy: () => ({_: 'disallow'})})
)

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

    it(`${type} keeps IMG open while it lists no image, whatever submits it`, async () => {
        const {done} = await open(type, Inputs, {images: []})
        expect(button('button.done').disabled).toBe(true)

        await act(async () => button('button.done').click())
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await submitForm()

        expect(done).not.toHaveBeenCalled()
        expect(button('button.done')).toBeDefined()
    })

    it(`${type} keeps IMG open when its last image goes just before a submission the list has not rendered`, async () => {
        const {done} = await open(type, Inputs)

        await act(async () => {
            removeInputImage('recipe', ASSET_INPUT)
            requestSubmit()
        })

        expect(appliedImages()).toEqual([])
        expect(done).not.toHaveBeenCalled()
        expect(button('button.done')).toBeDefined()
    })

    it.each([['no image', [], []], ['an image', undefined, ['next']]])(`${type} goes on from IMG listing %s only once it lists one`, async (_case, images, opened) => {
        await open(type, Inputs, {images, panels: ['inputImagery', 'next']})
        expect(button('button.next')).toBeDefined()

        await submitForm()

        expect(openSteps()).toEqual(opened)
    })

    it(`${type} lists each input by its source, a recipe the listing does not hold by its id, and removes one`, async () => {
        await open(type, Inputs, {
            images: [recipeInput('i-1', 'unlisted'), recipeInput('i-2', 'loaded'), recipeInput('i-3', 'listed'), ASSET_INPUT],
            listed: [{id: 'listed', name: 'Listed recipe'}],
            loaded: [{id: 'loaded', title: 'Loaded recipe'}]
        })

        expect(listed()).toEqual(['unlisted', 'Loaded recipe', 'Listed recipe', ASSET_INPUT.id])

        await press(removeButtonOf('unlisted'))

        expect(appliedImages().map(({id}) => id)).toEqual(['loaded', 'listed', ASSET_INPUT.id])
        expect(listed()).toEqual(['Loaded recipe', 'Listed recipe', ASSET_INPUT.id])
    })
}

it('BAND_MATH shows an input\'s variable alias apart from its source\'s name', async () => {
    await open('BAND_MATH', BandMathInputs, {images: [{...recipeInput('i-1', 'unlisted'), name: 'b1'}]})

    expect(listed()).toEqual(['unlisted'])
    expect(rowOf('unlisted').textContent).toContain('b1')
})

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const ASSET_INPUT = {imageId: 'i-asset', name: 'i1', type: 'ASSET', id: 'users/x/image',
    includedBands: [{id: 'red', name: 'red', band: 'red'}], bandSetSpecs: [{id: 'raw', type: 'IMAGE_BANDS', included: ['red']}]}

const recipeInput = (imageId, id) => ({...ASSET_INPUT, imageId, type: 'RECIPE_REF', id})

// What the list describes each input as, in order.
const listed = () => [...document.querySelectorAll(`.${crudItemStyles.description}`)].map(element => element.textContent)

const rowOf = description => [...document.querySelectorAll(`.${listItemStyles.verticalWrapper}`)]
    .find(row => row.querySelector(`.${crudItemStyles.description}`)?.textContent === description)

const removeButtonOf = description => rowOf(description).querySelector('svg[data-icon="trash"]').closest('button')

// Removing asks first: pressed as a user presses it, and confirmed.
const press = async element => {
    await act(async () => ['mouseenter', 'mousedown', 'mouseup', 'click']
        .forEach(type => element.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    const confirm = button('button.remove')
    confirm && await act(async () => ['mouseenter', 'mousedown', 'mouseup', 'click']
        .forEach(type => confirm.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
}

const openSteps = () => [...document.querySelectorAll('[data-panel]')].map(panel => panel.dataset.panel)

const appliedImages = () => store.getState().process.loadedRecipes.recipe.model.inputImagery.images

const requestSubmit = () => document.querySelector('form').requestSubmit()

const submitForm = () => act(async () => requestSubmit())

const open = async (type, Inputs, {images = [ASSET_INPUT], listed = [], loaded = [], panels = ['inputImagery']} = {}) => {
    const model = {inputImagery: {images}, calculations: {calculations: []}, bandNames: {bandNames: []}, outputBands: {outputImages: []}}
    const initial = {dimensions: {width: 1024, height: 768}, process: {
        loadedRecipes: {
            recipe: {id: 'recipe', type, revision: 1, model, ui: {initialized: false}},
            ...Object.fromEntries(loaded.map(recipe => [recipe.id, {type: 'MOSAIC', revision: 1, model: {}, ...recipe}]))
        },
        recipes: [{id: 'recipe', type, name: 'Recipe', revision: 1}, ...listed.map(recipe => ({type: 'MOSAIC', revision: 1, ...recipe}))],
        projects: [],
        tabs: []
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
            <Recipe id='recipe'><PanelWizard panels={panels} initialized={false} onDone={done}>
                <Inputs/>
                <NextStep/>
            </PanelWizard></Recipe>
        </ActivationContext></EventShield></PortalContext>
    </Provider>))
    return {done, model}
}
