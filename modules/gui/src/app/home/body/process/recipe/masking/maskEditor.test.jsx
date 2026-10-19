import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// A Masking without a mask, as its real toolbar, set-up wizard and mask editor show it over a real store and source
// runtime: its section marked and its image held, as its shared definition finds it, and the editor's selector saying
// so for whatever draft chooses no mask, of either kind - opening it edits nothing. A draft choosing one says nothing,
// changing what is applied only once applied. Earth Engine answers for the two assets alone.

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetMetadata$: ({asset}) => BANDS[asset]
            ? of({type: 'Image', bandNames: BANDS[asset], bands: BANDS[asset].map(id => ({id, data_type: {type: 'PixelType', precision: 'int'}})), properties: {}})
            : NEVER,
        bands$: ({asset}) => BANDS[asset] ? of(BANDS[asset].map(name => ({name, arrayDimensions: 0}))) : NEVER,
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
    },
    recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of([])}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: masking} = await import('./masking')
const {MaskingToolbar} = await import('./panels/maskingToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {requestGate} = await import('../sourceRequirements')

addRecipeType(masking())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Masking without a mask, set up', () => {
    it('is marked and held, and its editor opens unedited, saying beside the empty selector that a mask is needed', async () => {
        await open(withoutMask())
        expect(inError(MASK)).toBe(true)
        expect(previewGate()).toMatchObject({withdraw: true})

        await press(MASK)

        expect(errorsOf(ASSET_FIELD)).toEqual([MISSING_MASK])
        expect(applyOffered()).toBe(false)
        expect(model()).toEqual(withoutMask().model)
    })

    // Switching kind clears the selection, which the selector's own rule then requires: said beside it.
    it('says it beside the recipe selector once the draft chooses a recipe and none is selected', async () => {
        await open(withoutMask())
        await press(MASK)

        await press('process.sourceType.RECIPE')

        expect(errorsOf(RECIPE_FIELD)).toContain(MISSING_MASK)
    })

    it('says nothing once the draft chooses a mask, and again once it chooses none, the recipe still marked and held', async () => {
        await open(withoutMask())
        await press(MASK)

        await chooseAsset(MASK_ASSET)
        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(inError(MASK)).toBe(true)
        expect(previewGate()).toMatchObject({withdraw: true})

        await press('process.sourceType.RECIPE')
        expect(errorsOf(RECIPE_FIELD)).toContain(MISSING_MASK)
    })

    it('stays as applied when the chosen mask is cancelled: marked, held, and said again on opening', async () => {
        await open(withoutMask())
        await press(MASK)
        await chooseAsset(MASK_ASSET)

        await press('button.cancel')

        expect(model()).toEqual(withoutMask().model)
        expect(inError(MASK)).toBe(true)
        expect(previewGate()).toMatchObject({withdraw: true})
        await press(MASK)
        expect(errorsOf(ASSET_FIELD)).toEqual([MISSING_MASK])
    })

    it('is unmarked and drawn once the chosen mask is applied', async () => {
        await open(withoutMask())
        await press(MASK)
        await chooseAsset(MASK_ASSET)

        await press('button.apply')

        expect(model().imageMask).toMatchObject({type: 'ASSET', id: MASK_ASSET})
        expect(inError(MASK)).toBe(false)
        expect(previewGate()).toBeNull()
    })
})

describe('a Masking with a mask', () => {
    it('opens its mask editor saying nothing, writing nothing', async () => {
        await open(withoutMask())
        await press(MASK)
        await chooseAsset(MASK_ASSET)
        await press('button.apply')
        const applied = model()

        await press(MASK)

        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(model()).toEqual(applied)
    })
})

// Its set-up wizard holds the mask step until a mask is chosen, so no Masking is left without one through it. Arriving
// there is no error: nothing has been left out yet.
describe('a Masking set up by its wizard', () => {
    it('arrives at the mask step saying and marking nothing, the step selected, Done held until a mask is chosen', async () => {
        await atMaskStep()

        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(inError(MASK)).toBe(false)
        expect(button(MASK).classList.contains(toolbarButtonStyles.selected)).toBe(true)
        expect(button('button.done').disabled).toBe(true)

        await chooseAsset(MASK_ASSET)
        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(button('button.done').disabled).toBe(false)
    })

    it('says a mask is needed beside the selector once the selector is left empty', async () => {
        await atMaskStep()

        await leave(selector(ASSET_FIELD))

        expect(errorsOf(ASSET_FIELD)).toEqual([REQUIRED, MISSING_MASK])
        expect(inError(MASK)).toBe(false)
        expect(button('button.done').disabled).toBe(true)
    })
})

// A new selector's own rule - a source is required - follows the user: nothing is said while it is first visited, it is
// said once the selector is left empty, and until a source is chosen. What it requires holds Next all along. The wizard's
// first step has no other rule to say.
describe('a new selector of the image to mask', () => {
    it('stays neutral while first focused, Next held', async () => {
        await openNew()

        await focus(selector(ASSET_FIELD))

        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(button('button.next').disabled).toBe(true)
    })

    it('says a source is required once left empty, and still when focused again', async () => {
        await openNew()
        await focus(selector(ASSET_FIELD))

        await leave(selector(ASSET_FIELD))
        expect(errorsOf(ASSET_FIELD)).toEqual([REQUIRED])

        await focus(selector(ASSET_FIELD))
        expect(errorsOf(ASSET_FIELD)).toEqual([REQUIRED])
    })

    it('says nothing once a source is chosen, Next no longer held', async () => {
        await openNew()
        await leave(selector(ASSET_FIELD))

        await chooseAsset(PRIMARY_ASSET)

        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(button('button.next').disabled).toBe(false)
    })

    // Pressing an option takes focus from the input, which the picker takes back.
    it('stays neutral while its options are being used', async () => {
        await openNew()
        await typeFilter(PRIMARY_ASSET)

        await leave(selector(ASSET_FIELD))

        expect(options()).not.toEqual([])
        expect(errorsOf(ASSET_FIELD)).toEqual([])
    })

    it('shows the other kind\'s selector neutral when switched to, Next held, however the one left was', async () => {
        await openNew()
        await leave(selector(ASSET_FIELD))

        await press('process.sourceType.RECIPE')
        expect(errorsOf(RECIPE_FIELD)).toEqual([])
        expect(button('button.next').disabled).toBe(true)

        await leave(selector(RECIPE_FIELD))
        await press('process.sourceType.ASSET')
        expect(errorsOf(ASSET_FIELD)).toEqual([])
        expect(button('button.next').disabled).toBe(true)

        await press('process.sourceType.RECIPE')
        expect(errorsOf(RECIPE_FIELD)).toEqual([])
    })
})

const ID = 'masking-1'
const PRIMARY_ASSET = 'users/x/landsat'
const MASK_ASSET = 'users/x/forest'
const BANDS = {[PRIMARY_ASSET]: ['red', 'nir'], [MASK_ASSET]: ['forest']}
const MASK = 'process.masking.panel.inputImage.imageMask.button.label'
const ASSET_FIELD = 'process.masking.panel.inputImage.image.label'
const RECIPE_FIELD = ASSET_FIELD
const MISSING_MASK = 'process.masking.panel.inputImage.imageMask.missing'
const REQUIRED = 'fieldValidation.notBlank {}'

const image = id => ({type: 'ASSET', id, bands: BANDS[id], visualizations: []})

const withoutMask = () => ({
    id: ID,
    type: 'MASKING',
    revision: 1,
    ui: {initialized: true},
    model: {imageToMask: image(PRIMARY_ASSET)}
})

// A new Masking, at its wizard's first step.
async function openNew() {
    await open({...withoutMask(), model: {}, ui: {initialized: false}})
}

// A new Masking, its image to mask chosen in the wizard's first step, at its mask step.
async function atMaskStep() {
    await openNew()
    await chooseAsset(PRIMARY_ASSET)
    await press('button.next')
}

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(recipe) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            recipes: [{id: recipe.id, name: 'Masked', type: recipe.type, revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: recipe.id}]
        },
        assets: {user: [PRIMARY_ASSET, MASK_ASSET].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
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
                <SourceRuntimeProvider>
                    <Runtime/>
                    <Recipe id={recipe.id}>
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                <MaskingToolbar/>
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
    await click(button(label))
}

// An asset chosen in the editor's picker, by typing its id and picking it.
async function chooseAsset(asset) {
    await typeFilter(asset)
    await click(options().find(option => option.textContent.includes(asset)))
}

// The picker opened and filtered by typing into it.
async function typeFilter(text) {
    const input = selector(ASSET_FIELD)
    await click(input)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function focus(input) {
    await act(async () => input.focus())
    await settled()
}

// Focus moved away from an input, as clicking elsewhere moves it.
async function leave(input) {
    await act(async () => input.blur())
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

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

// An unedited panel offers Close rather than Apply.
const applyOffered = () => !!button('button.apply')

const inError = label => button(label).classList.contains(toolbarButtonStyles.error)

const field = label => document.querySelector(`[data-label="${label}"]`)

const selector = label => field(label).querySelector('input')

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

// Why a new preview of the Masking may not be requested, as a layer showing it asks.
const previewGate = () => requestGate({
    state: store.getState(),
    recipe: selectFrom(store.getState(), ['process.loadedRecipes', ID]),
    operation: 'IMAGE_OUTPUT',
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
})
