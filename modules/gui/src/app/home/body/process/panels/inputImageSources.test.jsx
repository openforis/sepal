import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// The source of an input chosen in the panel editing it, as each input imagery form offers it, over a real store: a
// source another input of the recipe uses is not offered, or is refused where it is typed. A saved recipe whose inputs
// already share a source stays editable.

const fake = vi.hoisted(() => ({metadata: null}))
vi.mock('~/apiRegistry', async () => {
    const {from, NEVER, of} = await import('rxjs')
    return {default: {
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => NEVER},
        gee: {
            // Answered later, as Earth Engine answers.
            assetMetadata$: () => from(Promise.resolve(fake.metadata)),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: () => NEVER
        }
    }}
})
// Every recipe listed is of a type producing an image, so only what the form itself excludes is not offered.
vi.mock('~/app/home/body/process/recipeTypeRegistry', async importOriginal => ({
    ...await importOriginal(),
    getRecipeType: id => ({id, imageSource: true})
}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The panel editing one input is open for the input it was activated with.
const activation = vi.hoisted(() => ({imageId: null}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: ({id}) => Component => props => {
            const [active, setActive] = useState(true)
            return id === 'inputImage' && active
                ? <Component {...props} activatable={{active, imageId: activation.imageId, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))

const {InputImage: SharedInputImage} = await import('./inputImagery/inputImage')
const {InputImage: DerivedInputImage} = await import('./inputImageryWithDerived/inputImage')
const {InputImage: BandMathInputImage} = await import('../recipe/bandMath/panels/inputImagery/inputImage')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'recipe-1'
const ASSET_X = 'users/x/image-x'
const ASSET_Y = 'users/x/image-y'

let root, container, store

beforeEach(() => {
    fake.metadata = {
        type: 'Image',
        bandNames: ['red', 'nir'],
        bands: ['red', 'nir'].map(id => ({id, data_type: {type: 'PixelType', precision: 'float'}})),
        properties: {}
    }
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

const FORMS = [
    {
        form: 'Stack and Remapping', InputImage: SharedInputImage,
        assetSection: 'process.panels.inputImagery.asset.title',
        recipeSection: 'process.panels.inputImagery.recipe.title',
        assetLabel: 'process.classChange.panel.inputImage.asset.label',
        bands: {red: {}, nir: {}}
    },
    {
        form: 'the classification family', InputImage: DerivedInputImage,
        assetSection: 'process.classification.panel.inputImagery.asset.title',
        recipeSection: 'process.classification.panel.inputImagery.recipe.title',
        assetLabel: 'process.classification.panel.inputImagery.form.asset.label',
        bands: ['red', 'nir']
    },
    {
        form: 'Band Math', InputImage: BandMathInputImage,
        assetSection: 'process.panels.inputImagery.asset.title',
        recipeSection: 'process.panels.inputImagery.recipe.title',
        assetLabel: 'process.classChange.panel.inputImage.asset.label',
        bands: {red: {}, nir: {}}
    }
]

describe.each(FORMS)('an input in the form of $form', ({InputImage, assetSection, recipeSection, assetLabel, bands}) => {
    const input = (imageId, type, id) => inputOf(imageId, type, id, bands)

    it('cannot be added with an asset another input uses, and can with another', async () => {
        await editInput(InputImage, {images: [input('input-a', 'ASSET', ASSET_X)], imageId: 'input-new'})
        await choose(assetSection)

        await selectAsset(assetLabel, ASSET_X)
        expect(errorsOf(assetLabel)).toEqual([expect.stringContaining(DUPLICATE)])
        expect(applyEnabled()).toBe(false)

        await selectAsset(assetLabel, ASSET_Y)
        expect(errorsOf(assetLabel)).toEqual([])
    })

    it('is not offered a recipe another input uses', async () => {
        await editInput(InputImage, {images: [input('input-a', 'RECIPE_REF', 'mosaic-1')], imageId: 'input-new'})
        await choose(recipeSection)

        await openRecipeOptions()

        expect(offered()).toContain('Other mosaic')
        expect(offered()).not.toContain('Mosaic')
    })

    it('cannot be changed to the asset of another input', async () => {
        const images = [input('input-a', 'ASSET', ASSET_X), input('input-b', 'ASSET', ASSET_Y)]
        await editInput(InputImage, {images, imageId: 'input-b'})

        await selectAsset(assetLabel, ASSET_X)

        expect(errorsOf(assetLabel)).toEqual([expect.stringContaining(DUPLICATE)])
        expect(applyEnabled()).toBe(false)
    })

    it('keeps the asset it shares with another input in a saved recipe, applying an edit that leaves it', async () => {
        const images = [input('input-a', 'ASSET', ASSET_X), input('input-b', 'ASSET', ASSET_X)]
        await editInput(InputImage, {images, imageId: 'input-b'})

        await addBand('nir')
        await apply()

        expect(savedImages().map(({imageId, id}) => [imageId, id])).toEqual([['input-a', ASSET_X], ['input-b', ASSET_X]])
    })

    it('can be given back the asset it shares with another input in a saved recipe', async () => {
        const images = [input('input-a', 'ASSET', ASSET_X), input('input-b', 'ASSET', ASSET_X)]
        await editInput(InputImage, {images, imageId: 'input-b'})
        await selectAsset(assetLabel, ASSET_Y)

        await selectAsset(assetLabel, ASSET_X)

        expect(errorsOf(assetLabel)).toEqual([])
    })
})

const DUPLICATE = 'process.panels.inputImagery.form.duplicateSource'

const inputOf = (imageId, type, id, bands) => ({
    imageId, name: imageId, type, id,
    ...(type === 'ASSET' ? {asset: id} : {recipe: id}),
    bands,
    includedBands: [{id: `${imageId}-red`, name: 'red', band: 'red'}],
    bandSetSpecs: [{id: `${imageId}-spec`, type: 'IMAGE_BANDS', included: ['red']}]
})

const editInput = async (InputImage, {images, imageId}) => {
    activation.imageId = imageId
    const initialState = {
        process: {
            loadedRecipes: {
                [ID]: {id: ID, type: 'STACK', revision: 1, model: {inputImagery: {images}, calculations: {calculations: []}}, ui: {initialized: true}}
            },
            recipes: [
                {id: ID, name: 'Recipe', type: 'STACK', revision: 1},
                {id: 'mosaic-1', name: 'Mosaic', type: 'MOSAIC', revision: 1},
                {id: 'mosaic-2', name: 'Other mosaic', type: 'MOSAIC', revision: 1}
            ],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [ASSET_X, ASSET_Y].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <Recipe id={ID}>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <InputImage/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </Provider>
    ))
    await settled()
}

const choose = label => act(async () => panelButton(label).click())

// An asset typed into the picker and chosen from what it offers, as a user chooses it.
const selectAsset = async (label, id) => {
    const input = field(label).querySelector('input')
    await act(async () => input.click())
    await act(async () => setValue(input, id))
    await act(async () => option(id).click())
    await settled()
}

// A band the input does not yet include added, as its "+" offers it.
const addBand = async name => {
    await act(async () => document.querySelector('svg[data-icon="plus"]').closest('button').click())
    await act(async () => option(name).click())
    await settled()
}

const savedImages = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.inputImagery.images'])

const openRecipeOptions = () => act(async () => field('widget.recipeInput.label').querySelector('input').click())

const setValue = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const option = label => options().find(element => element.textContent.includes(label))

const offered = () => options().map(element => element.textContent)

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

// An unedited panel offers no Apply.
const applyEnabled = () => panelButton('button.apply')?.disabled === false

const apply = async () => {
    await act(async () => panelButton('button.apply').click())
    await settled()
}

const settled = () => act(async () => {})
