import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

import outputBandsStyles from './panels/outputBands/outputBands.module.css'

// What the Band Math editor marks about its sections: the toolbar buttons, and the rows of the lists their panels show,
// each from what the section's own rules or the output read find - one section's problem never hiding another's. The
// real toolbar, lists and sync over a real store and source runtime; Earth Engine answers each request when a test says
// so.

const earthEngine = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: request => new Observable(subscriber => {
            earthEngine.requests.push({request, subscriber})
        }),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {save$: () => new Observable(), load$: () => new Observable(), loadAll$: () => of(LISTING)}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// Input imagery and Output bands are open; no other panel is, and no button is pressed.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => ['inputImagery', 'outputBands'].includes(id)
        ? <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{
        activatables: {button: {active: false, canActivate: true, toggle: () => {}}},
        updateActivatables: () => {}
    }}/>
}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('./bandMath')
const {BandMathToolbar} = await import('./panels/bandMathToolbar')
const {Sync} = await import('./sync/sync')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(bandMath())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'
const LISTING = [{id: ID, name: 'Math', type: 'BAND_MATH', revision: 1}]
const ASSET = 'users/x/a'

let root, container, store

beforeEach(() => {
    earthEngine.requests = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('an output image left without bands by unselecting the band it output', () => {
    it('loses that output, and is marked on its row and on Output bands until it is given a band again', async () => {
        await open(recipe({
            images: [input('i-1', 'i1', ['red', 'nir']), input('i-2', 'i2', ['swir'])],
            outputImages: [outputImage('i-1', ['red']), outputImage('i-2', ['swir'])]
        }))
        expect(inError(OUTPUT_BANDS)).toBe(false)

        await setModel(model => ({...model, inputImagery: {images: [input('i-1', 'i1', ['nir']), input('i-2', 'i2', ['swir'])]}}))
        await reopen()

        expect(outputImageOf('i-1').outputBands).toEqual([])
        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(buttonTooltip(OUTPUT_BANDS)).toEqual(expect.stringContaining('process.bandMath.requirement.noOutputBands'))
        expect(outputRowsInError()).toEqual(['i1'])

        await setModel(model => ({
            ...model,
            outputBands: {outputImages: model.outputBands.outputImages.map(image => image.imageId === 'i-1'
                ? {...image, outputBands: [outputBand('i-1', 'nir')]}
                : image)}
        }))
        await reopen()

        expect(inError(OUTPUT_BANDS)).toBe(false)
        expect(outputRowsInError()).toEqual([])
    })
})

describe('Output bands without any output image', () => {
    it('is marked until an image is output again', async () => {
        await open(recipe({images: [input('i-1', 'i1', ['red'])], outputImages: []}))

        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(buttonTooltip(OUTPUT_BANDS)).toEqual(expect.stringContaining('process.bandMath.requirement.noOutputImages'))

        await setModel(model => ({...model, outputBands: {outputImages: [outputImage('i-1', ['red'])]}}))

        expect(inError(OUTPUT_BANDS)).toBe(false)
    })
})

describe('an output image of a calculation that is unmet', () => {
    it('marks Output bands, naming the calculation, while Calculations says what is wrong with it', async () => {
        await open(recipe({
            calculations: [expression('calc-1', 'swirred', 'i1.swir * 2')],
            outputImages: [outputImage('calc-1', ['swirred'])]
        }))

        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(buttonTooltip(OUTPUT_BANDS)).toEqual(expect.stringContaining('process.requirement.prerequisiteUnmet'))
        expect(buttonTooltip(OUTPUT_BANDS)).not.toEqual(expect.stringContaining('process.bandMath.requirement.unknownBand'))
        expect(inError(CALCULATIONS)).toBe(true)
        expect(buttonTooltip(CALCULATIONS)).toEqual(expect.stringContaining('process.bandMath.requirement.unknownBand'))
        expect(outputRowsInError()).toEqual(['swirred'])
    })
})

describe('output bands named as Output bands refuses to apply', () => {
    it.each([
        ['a name another output band has', ['same', 'same'], 'duplicateOutputName', ['i1', 'i2']],
        ['an invalid name', ['1_invalid', 'valid'], 'invalidOutputName', ['i1']]
    ])('given %s mark Output bands and their rows', async (_case, [first, second], message, rows) => {
        await open(recipe({
            images: [input('i-1', 'i1', ['red']), input('i-2', 'i2', ['nir'])],
            outputImages: [outputImage('i-1', ['red'], first), outputImage('i-2', ['nir'], second)]
        }))

        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(buttonTooltip(OUTPUT_BANDS)).toEqual(expect.stringContaining(`process.bandMath.requirement.${message}`))
        expect(outputRowsInError()).toEqual(rows)
    })
})

describe('an input lacking a band beside an output image without bands', () => {
    it('marks both Input imagery and Output bands', async () => {
        await open(recipe({
            images: [input('i-1', 'i1', ['red', 'nir']), input('i-2', 'i2', ['swir'])],
            outputImages: [outputImage('i-1', ['red']), outputImage('i-2', [])]
        }))

        await answer({[ASSET]: ['red'], [`${ASSET}-i-2`]: ['swir']})

        expect(inError(INPUT_IMAGERY)).toBe(true)
        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(buttonTooltip(INPUT_IMAGERY)).toEqual(expect.stringContaining('process.bandMath.requirement.missingInputBands'))
    })
})

// The description refuses these before reading any input; the editor reads them to say what else needs repair.
describe('an input lacking a band beside a configuration the description refuses', () => {
    it.each([
        ['output names repeated', [{...outputImage('i-1', ['red'], 'same'), outputBands: [outputBand('i-1', 'red', 'same'), {...outputBand('i-1', 'red', 'same'), id: 'copy'}]}]],
        ['nothing output', []]
    ])('with %s marks Output bands at once, and the input once its source is read', async (_case, outputImages) => {
        await open(recipe({images: [input('i-1', 'i1', ['red', 'nir'])], outputImages}))
        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(inError(INPUT_IMAGERY)).toBe(false)

        await answer({[ASSET]: ['red']})

        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(inError(INPUT_IMAGERY)).toBe(true)
        expect(buttonTooltip(INPUT_IMAGERY)).toEqual(expect.stringContaining('process.bandMath.requirement.missingInputBands'))
        expect(imageObservations()).toEqual([])
    })

    it('marks no input when its source cannot be read', async () => {
        await open(recipe({images: [input('i-1', 'i1', ['red', 'nir'])], outputImages: []}))

        await answer({})

        expect(inError(OUTPUT_BANDS)).toBe(true)
        expect(inError(INPUT_IMAGERY)).toBe(false)
    })
})

const imageObservations = () => earthEngine.requests.filter(({request}) => request.recipe)

const INPUT_IMAGERY = 'process.panels.inputImagery.button'
const CALCULATIONS = 'process.bandMath.panel.calculations.button'
const OUTPUT_BANDS = 'process.bandMath.panel.outputBands.button'

const band = (imageId, name) => ({id: `${imageId}-${name}`, name})

const input = (imageId, name, bands) => ({
    imageId, name, type: 'ASSET', id: imageId === 'i-1' ? ASSET : `${ASSET}-${imageId}`,
    includedBands: bands.map(name => band(imageId, name))
})

function expression(imageId, name, text) {
    return {
        imageId, name, type: 'EXPRESSION', expression: text, dataType: 'auto', bandRenameStrategy: 'SUFFIX',
        usedBands: [], includedBands: [band(imageId, name)]
    }
}

const outputBand = (imageId, name, outputName) => ({
    ...band(imageId, name), defaultOutputName: `${imageId}_${name}`, ...(outputName && {outputName})
})

const outputImage = (imageId, bands, outputName) => ({
    imageId, outputBands: bands.map(name => outputBand(imageId, name, outputName))
})

const recipe = ({images = [input('i-1', 'i1', ['red', 'nir'])], calculations = [], outputImages}) => ({
    id: ID,
    type: 'BAND_MATH',
    revision: 1,
    ui: {initialized: true},
    model: {inputImagery: {images}, calculations: {calculations}, outputBands: {outputImages}}
})

const tree = () =>
    <Provider store={store}>
        <SourceRuntimeProvider>
            <Recipe id={ID}>
                <Sync/>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <BandMathToolbar/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </SourceRuntimeProvider>
    </Provider>

async function open(recipe) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
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
    await act(async () => root.render(tree()))
    await settled()
}

// The editor closed and opened again over the session as it stands: a panel shows what was applied when it opens.
async function reopen() {
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(tree()))
    await settled()
}

// The model as a panel's Apply would leave it, for the sync to follow.
async function setModel(change) {
    const model = selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])
    await act(async () => actionBuilder('SET_MODEL')
        .set(['process.loadedRecipes', ID, 'model'], change(model))
        .dispatch())
    await settled()
}

const waiting = () => earthEngine.requests.filter(({subscriber}) => !subscriber.closed)

// Answers every request still waiting: an asset with its bands; the Band Math image refused, as Earth Engine refuses
// one selecting a band its input lacks.
async function answer(assets) {
    await act(async () => waiting().forEach(({request, subscriber}) => {
        const bands = request.asset && assets[request.asset]
        if (bands) {
            subscriber.next(bands.map(name => ({name, arrayDimensions: 0})))
            subscriber.complete()
        } else {
            subscriber.error(new Error('Image.select: Band pattern did not match any bands.'))
        }
    }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const outputImageOf = imageId => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.outputBands.outputImages'])
    .find(image => image.imageId === imageId)

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))

// Whether a section's toolbar button is in its error state.
const inError = label => button(label).classList.contains(classOf(toolbarButtonStyles, 'error'))

// What a section's toolbar button says of it.
const buttonTooltip = label => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.contains(button(label)) || button(label).contains(element))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')

// The output images whose rows in Output bands are in their error state, by the name of the image each is taken from.
const outputRowsInError = () => {
    const recipe = selectFrom(store.getState(), ['process.loadedRecipes', ID])
    const names = [...recipe.model.inputImagery.images, ...recipe.model.calculations.calculations].map(({name}) => name)
        .sort((a, b) => b.length - a.length)
    return [...document.getElementsByClassName(classOf(outputBandsStyles, 'error'))]
        .map(row => names.find(name => row.textContent.includes(name)))
}

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name]
}
