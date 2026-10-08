import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

import inputImageryStyles from './panels/inputImagery/inputImagery.module.css'

// What the Band Math editor marks when its output read finds an input lacking a band it includes: the Input imagery
// button and that input's row, saying which bands. The real toolbar and Input imagery list over a real store and source
// runtime; Earth Engine answers each request when a test says so - an asset with its bands, the Band Math image with
// its output or refusing it, as it refuses an image selecting a band its input lacks.

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
// The Input imagery panel is open; no other panel is, and no button is pressed.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => id === 'inputImagery'
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
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {readRecipeOutput} = await import('../recipeOutput')

addRecipeType(bandMath())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'band-math-1'
const QUESTION = Object.freeze({recipeId: ID, product: {name: 'IMAGE_OUTPUT'}})

const LISTING = [{id: ID, name: 'Math', type: 'BAND_MATH', revision: 1}, {id: 'inner', name: 'Inner', type: 'BAND_MATH', revision: 1}]

let root, container, store, runtime

beforeEach(() => {
    earthEngine.requests = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('an input lacking a band it includes', () => {
    it('is marked, naming the band, with Input imagery; the other input is not', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir']), input('i-2', 'i2', 'users/x/b', ['swir'])]))

        await answer({assets: {'users/x/a': ['red'], 'users/x/b': ['swir']}})

        expect(markedInputs()).toEqual([{name: 'i1', bands: 'nir'}])
        expect(inputImageryMark()).toEqual({item: 'i1', bands: 'nir'})
        expect(inputsInError()).toEqual(['i1'])
        expect(inputImageryInError()).toBe(true)
    })

    // A saved recipe can hold two inputs of one source, each including its own bands.
    it('is judged by its own bands where another input takes the same source', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red']), input('i-2', 'i2', 'users/x/a', ['nir'])]))

        await answer({assets: {'users/x/a': ['red']}})

        expect(markedInputs()).toEqual([{name: 'i2', bands: 'nir'}])
        expect(inputsInError()).toEqual(['i2'])
    })

    it('is no longer marked once the band is back, the editor still open', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])]))
        await answer({assets: {'users/x/a': ['red']}})
        expect(inputsInError()).toEqual(['i1'])
        expect(inputImageryInError()).toBe(true)

        await act(async () => runtime.refreshOutput(QUESTION))
        await answer({assets: {'users/x/a': ['red', 'nir']}, image: ['red']})

        expect(markedInputs()).toEqual([])
        expect(inputImageryMark()).toBeNull()
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })

    it('is no longer in error while its evidence is read again', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])]))
        await answer({assets: {'users/x/a': ['red']}})

        await act(async () => runtime.refreshOutput(QUESTION))

        expect(waiting()).not.toHaveLength(0)
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })

    it('leaves the recipe as it was configured', async () => {
        const recipe = recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])])
        await open(recipe)

        await answer({assets: {'users/x/a': ['red']}})

        expect(markedInputs()).toHaveLength(1)
        expect(selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])).toEqual(recipe.model)
    })
})

describe('an input whose bands are not established', () => {
    it('is not marked while its evidence is being read', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])]))

        expect(waiting()).not.toHaveLength(0)
        expect(markedInputs()).toEqual([])
        expect(inputImageryMark()).toBeNull()
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })

    it('is not marked when its evidence cannot be read', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])]))

        await answer({assets: {'users/x/a': new Error('Earth Engine unavailable')}})

        expect(markedInputs()).toEqual([])
        expect(inputImageryMark()).toBeNull()
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })
})

// A diagnosis is located in the configuration it was read from; until the configuration as it is now is read, none is
// shown, and what that read finds is shown on the input it finds it on.
describe('a configuration changed after an input was marked', () => {
    const marked = async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red']), input('i-2', 'i2', 'users/x/b', ['nir'])]))
        await answer({assets: {'users/x/a': ['red'], 'users/x/b': ['swir']}})
        expect(markedInputs()).toEqual([{name: 'i2', bands: 'nir'}])
    }

    it('marks no other input once the marked one is removed', async () => {
        await marked()

        await setImages(images => images.filter(({imageId}) => imageId !== 'i-2'))

        expect(markedInputs()).toEqual([])
        expect(inputsInError()).toEqual([])
        await answer({assets: {'users/x/a': ['red']}, image: ['red']})
        expect(markedInputs()).toEqual([])
    })

    it('follows the marked input when the inputs are reordered', async () => {
        await marked()

        await setImages(images => [...images].reverse())

        expect(markedInputs()).toEqual([])
        expect(inputsInError()).toEqual([])
        await answer({assets: {'users/x/a': ['red'], 'users/x/b': ['swir']}})
        expect(markedInputs()).toEqual([{name: 'i2', bands: 'nir'}])
        expect(inputsInError()).toEqual(['i2'])
    })

    it('is no longer marked once its source is replaced by one holding the band', async () => {
        await marked()

        await setImages(images => images.map(image => image.imageId === 'i-2' ? {...image, id: 'users/x/c'} : image))

        expect(markedInputs()).toEqual([])
        await answer({assets: {'users/x/a': ['red'], 'users/x/c': ['nir']}, image: ['red']})
        expect(markedInputs()).toEqual([])
    })
})

describe('an input Band Math lacking a band of its own input', () => {
    it('leaves the diagnosis with that recipe, marking none of this one\'s inputs', async () => {
        const inner = {...recipeOver([input('i-1', 'i1', 'users/x/a', ['red', 'nir'])]), id: 'inner'}
        await open(recipeOver([recipeInput('i-1', 'i1', inner.id, ['red', 'nir'])]), [inner])

        await answer({assets: {'users/x/a': ['red']}})

        expect(read().diagnostics).toEqual([expect.objectContaining({code: 'MISSING_INPUT_BAND', recipePath: [ID, inner.id]})])
        expect(markedInputs()).toEqual([])
        expect(inputImageryMark()).toBeNull()
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })
})

describe('the editor beside a map layer and a Retrieve', () => {
    it('shares their reading of the output', async () => {
        await open(recipeOver([input('i-1', 'i1', 'users/x/a', ['red'])]))
        const layer = runtime.watchOutput$(QUESTION).subscribe()
        const retrieve = runtime.watchOutput$(QUESTION).subscribe()

        await answer({assets: {'users/x/a': ['red']}, image: ['red']})

        expect(earthEngine.requests.filter(({request}) => request.recipe)).toHaveLength(1)
        expect(earthEngine.requests.filter(({request}) => request.asset)).toHaveLength(1)
        layer.unsubscribe()
        retrieve.unsubscribe()
    })
})

const input = (imageId, name, id, bands) => ({
    imageId, name, type: 'ASSET', id, includedBands: bands.map(band => ({id: `${imageId}-${band}`, name: band}))
})

const recipeInput = (imageId, name, id, bands) => ({...input(imageId, name, id, bands), type: 'RECIPE_REF'})

// Band Math over these inputs, outputting the first band the first includes.
const recipeOver = images => ({
    id: ID,
    type: 'BAND_MATH',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images},
        calculations: {calculations: []},
        outputBands: {outputImages: [{
            imageId: images[0].imageId,
            outputBands: [{id: images[0].includedBands[0].id, name: images[0].includedBands[0].name, defaultOutputName: 'red'}]
        }]}
    }
})

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(recipe, records = []) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries([recipe, ...records].map(record => [record.id, record])),
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
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ID}>
                    <Runtime/>
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
    ))
    await settled()
}

// The inputs as their panel would leave them.
async function setImages(change) {
    const images = selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.inputImagery.images'])
    await act(async () => actionBuilder('SET_IMAGES')
        .set(['process.loadedRecipes', ID, 'model.inputImagery.images'], change(images))
        .dispatch())
    await settled()
}

const waiting = () => earthEngine.requests.filter(({subscriber}) => !subscriber.closed)

// Answers every request still waiting: an asset with its bands, or failing with an Error; the Band Math image with
// `image`, or refused when it is not given.
async function answer({assets = {}, image}) {
    await act(async () => waiting().forEach(({request, subscriber}) => {
        const bands = request.asset ? assets[request.asset] : image
        if (bands instanceof Error) {
            subscriber.error(bands)
        } else if (bands) {
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

// The output read as the session holds it now.
const read = () => {
    const loadedRecipes = selectFrom(store.getState(), 'process.loadedRecipes')
    const recipe = loadedRecipes[ID]
    return readRecipeOutput({
        recipe, product: {name: 'IMAGE_OUTPUT'}, graph: buildMapDependencyGraph({recipe, loadedRecipes}),
        heldFor: key => runtime.heldFor(key)
    })
}

const MISSING = 'process.bandMath.requirement.missingInputBands'

const tooltipLines = element => [...element.querySelectorAll('[data-tooltip]')]
    .flatMap(tooltip => JSON.parse(tooltip.dataset.tooltip))

const valuesOf = (line, key) => JSON.parse(line.slice(key.length + 1))

// The inputs whose rows say they lack bands, by the name each row shows, with the bands they name.
const markedInputs = () => inputNames()
    .map(name => ({name, line: tooltipLines(rowOf(name)).find(line => line.startsWith(MISSING))}))
    .filter(({line}) => line)
    .map(({name, line}) => ({name, bands: valuesOf(line, MISSING).bands}))

// What the Input imagery button says of an input lacking bands, or null when it says nothing of one.
const inputImageryMark = () => {
    const line = tooltipLines(document).find(line => line.startsWith('process.requirement.itemProblem') && line.includes(MISSING))
    if (!line) {
        return null
    }
    const {item, message} = valuesOf(line, 'process.requirement.itemProblem')
    return {item, bands: valuesOf(message, MISSING).bands}
}

// The inputs whose rows are in their list's error state, by the name each shows.
const inputsInError = () => [...document.getElementsByClassName(classOf(inputImageryStyles, 'error'))]
    .map(row => inputNames().find(name => row.textContent.includes(name)))

// Whether the Input imagery toolbar button is in its error state.
const inputImageryInError = () => [...document.querySelectorAll('button')]
    .find(button => button.textContent.includes('process.panels.inputImagery.button'))
    .classList.contains(classOf(toolbarButtonStyles, 'error'))

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name]
}

const inputNames = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model.inputImagery.images'])
    .map(({name}) => name)

// The row showing an input: the element around the input's name holding one remove button.
const rowOf = name => [...document.querySelectorAll('svg[data-icon="trash"]')]
    .map(icon => ancestors(icon).find(element => element.textContent.includes(name)
        && element.querySelectorAll('svg[data-icon="trash"]').length === 1))
    .find(Boolean)

const ancestors = element => element.parentElement ? [element.parentElement, ...ancestors(element.parentElement)] : []
