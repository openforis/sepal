import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import inputImageryStyles from '~/app/home/body/process/panels/inputImagery/inputImagery.module.css'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// What the Stack editor marks about its sections, from its output read: an input lacking a band it maps on the Input
// imagery button and that input's row in the list Stack and Remapping share, before any input is opened; band names the
// mapping refuses on the Band names button, and on their fields once the panel opens - one section's problem never
// hiding the other's. The real toolbar, list and Band names panel over a real store and source runtime; Earth Engine
// answers each asset's bands when a test says so.

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
// The Input imagery list is open, and Band names once a test opens it; the panel editing one input is not, and no
// button is pressed.
const panels = vi.hoisted(() => ({open: new Set()}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => id === 'inputImagery' || panels.open.has(id)
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
const {default: stack} = await import('./stack')
const {StackToolbar} = await import('./panels/stackToolbar')
const {toBandNames} = await import('./panels/bandNames/bandNamesUpdate')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(stack())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'stack-1'
const QUESTION = Object.freeze({recipeId: ID, product: {name: 'IMAGE_OUTPUT'}})
const LISTING = [{id: ID, name: 'Stack', type: 'STACK', revision: 1}, {id: 'inner', name: 'Inner', type: 'STACK', revision: 1}]
const ASSET_A = 'users/x/a'
const ASSET_B = 'users/x/b'

let root, container, store, runtime

beforeEach(() => {
    earthEngine.requests = []
    panels.open.clear()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('an input lacking a band it maps', () => {
    it('is marked on its row and on Input imagery, naming the band; the other input is not', async () => {
        await open(stackOver([input('i-1', ASSET_A, ['red', 'nir']), input('i-2', ASSET_B, ['swir'])]))

        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})

        expect(inputsInError()).toEqual([ASSET_A])
        expect(inputImageryInError()).toBe(true)
        expect(markedInputs()).toEqual([{name: ASSET_A, bands: 'nir'}])
        expect(inputImageryMark()).toEqual({item: ASSET_A, bands: 'nir'})
    })

    it('leaves the recipe as it was configured', async () => {
        const recipe = stackOver([input('i-1', ASSET_A, ['red', 'nir'])])
        await open(recipe)

        await answer({[ASSET_A]: ['red']})

        expect(inputsInError()).toHaveLength(1)
        expect(selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])).toEqual(recipe.model)
    })

    it('is no longer marked once its source has the band again', async () => {
        await open(stackOver([input('i-1', ASSET_A, ['red', 'nir'])]))
        await answer({[ASSET_A]: ['red']})

        await act(async () => runtime.refreshOutput(QUESTION))
        expect(inputsInError()).toEqual([])
        await answer({[ASSET_A]: ['red', 'nir']})

        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
        expect(inputImageryMark()).toBeNull()
    })
})

// The description refuses a mapping naming two output bands alike before reading any input; the editor reads them to
// say what else needs repair.
describe('an input lacking a band beside a refused mapping', () => {
    it('is marked once its source is read', async () => {
        const recipe = stackOver([input('i-1', ASSET_A, ['red', 'nir']), input('i-2', ASSET_B, ['swir'])])
        recipe.model.bandNames.bandNames[1].bands[0].outputName = recipe.model.bandNames.bandNames[0].bands[0].outputName
        await open(recipe)
        expect(inputsInError()).toEqual([])

        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})

        expect(inputsInError()).toEqual([ASSET_A])
        expect(inputImageryInError()).toBe(true)
    })
})

describe('an input whose bands are not established', () => {
    it('is not marked while they are read, nor when they cannot be', async () => {
        await open(stackOver([input('i-1', ASSET_A, ['red', 'nir'])]))
        expect(waiting()).not.toHaveLength(0)
        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)

        await answer({[ASSET_A]: new Error('Earth Engine unavailable')})

        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
        expect(markedInputs()).toEqual([])
    })
})

describe('a configuration changed after an input was marked', () => {
    const marked = async () => {
        await open(stackOver([input('i-1', ASSET_A, ['red']), input('i-2', ASSET_B, ['nir'])]))
        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})
        expect(inputsInError()).toEqual([ASSET_B])
    }

    // The bands of each asset are already held, so the reordered configuration is read at once. Its band names keep
    // their order: each entry knows its input by imageId.
    it('follows the marked input when the inputs are reordered', async () => {
        await marked()

        await setModel(model => ({
            ...model,
            inputImagery: {images: [...model.inputImagery.images].reverse()}
        }))

        expect(inputsInError()).toEqual([ASSET_B])
        expect(markedInputs()).toEqual([{name: ASSET_B, bands: 'nir'}])
    })

    it('marks no other input once the marked one is removed', async () => {
        await marked()

        await setModel(model => ({
            ...model,
            inputImagery: {images: model.inputImagery.images.filter(({imageId}) => imageId !== 'i-2')},
            bandNames: {bandNames: model.bandNames.bandNames.filter(({imageId}) => imageId !== 'i-2')}
        }))
        await answer({[ASSET_A]: ['red']})

        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })
})

describe('an input Stack lacking a band of its own input', () => {
    it('leaves the diagnosis with that recipe, marking none of this one\'s inputs', async () => {
        const inner = {...stackOver([input('i-1', ASSET_A, ['red', 'nir'])]), id: 'inner'}
        await open(stackOver([recipeInput('i-1', inner.id, ['red', 'nir'])]), [inner])

        await answer({[ASSET_A]: ['red']})

        expect(inputsInError()).toEqual([])
        expect(inputImageryInError()).toBe(false)
    })
})

describe('band names saved alike', () => {
    const savedAlike = () => named(stackOver([input('i-1', ASSET_A, ['red']), input('i-2', ASSET_B, ['swir'])]), {'i-2-swir': 'red'})

    it('mark Band names at once, before any input is read or the panel opens', async () => {
        await open(savedAlike())

        expect(waiting()).not.toHaveLength(0)
        expect(bandNamesInError()).toBe(true)
        expect(bandNamesMark()).toEqual({item: ASSET_B, message: expect.stringContaining('process.stack.panel.bandNames.problem.duplicate')})
        expect(inputImageryInError()).toBe(false)
    })

    it('are each refused in their fields once the panel opens, the names kept', async () => {
        const recipe = savedAlike()
        await open(recipe)

        await openBandNames()

        expect(nameFields()).toEqual([
            {value: 'red', error: expect.stringContaining('process.stack.panel.bandNames.duplicateBand')},
            {value: 'red', error: expect.stringContaining('process.stack.panel.bandNames.duplicateBand')}
        ])
        expect(model()).toEqual(recipe.model)
    })

    it('are no longer marked once one is renamed in the panel and applied', async () => {
        await open(savedAlike())
        await openBandNames()

        await typeName(1, 'swir')
        expect(nameFields().map(({error}) => error)).toEqual([null, null])
        await apply()

        expect(bandNamesInError()).toBe(false)
        expect(model().bandNames.bandNames[1].bands[0].outputName).toBe('swir')
    })
})

describe('a band name saved blank', () => {
    it('marks Band names at once, and is refused in its field once the panel opens', async () => {
        await open(named(stackOver([input('i-1', ASSET_A, ['red', 'nir'])]), {'i-1-nir': ''}))
        expect(bandNamesMark()).toEqual({item: ASSET_A, message: expect.stringContaining('process.stack.panel.bandNames.problem.blank')})

        await openBandNames()

        expect(nameFields()).toEqual([
            {value: 'red', error: null},
            {value: '', error: expect.stringContaining('fieldValidation.notBlank')}
        ])
    })
})

describe('a band name saved misspelled', () => {
    const misspelled = () => named(stackOver([input('i-1', ASSET_A, ['red'])]), {'i-1-red': 'red-band'})

    it('marks Band names before the panel opens, and is refused in its field once it does', async () => {
        await open(misspelled())
        expect(bandNamesMark()).toEqual({item: ASSET_A, message: expect.stringContaining('process.stack.panel.bandNames.problem.invalidFormat')})

        await openBandNames()

        expect(nameFields()).toEqual([{value: 'red-band', error: expect.stringContaining('process.stack.panel.bandNames.invalidFormat')}])
    })

    it('is kept, still marked and refused, when an edit is cancelled', async () => {
        const recipe = misspelled()
        await open(recipe)
        await openBandNames()

        await typeName(0, 'red_band')
        expect(nameFields()).toEqual([{value: 'red_band', error: null}])
        await cancel()

        expect(model()).toEqual(recipe.model)
        expect(bandNamesInError()).toBe(true)
        await closeBandNames()
        await openBandNames()
        expect(nameFields()).toEqual([{value: 'red-band', error: expect.stringContaining('process.stack.panel.bandNames.invalidFormat')}])
    })

    it('is no longer marked or refused once renamed and applied', async () => {
        await open(misspelled())
        await openBandNames()

        await typeName(0, 'red_band')
        await apply()

        expect(model().bandNames.bandNames[0].bands[0].outputName).toBe('red_band')
        expect(bandNamesInError()).toBe(false)
        expect(nameFields()).toEqual([{value: 'red_band', error: null}])
    })
})

// Only a saved recipe can hold one: the editor maps every input it is given. Entries are found by imageId, so the one
// left is not taken for the first input's.
describe('an input its band names do not map', () => {
    const unmapped = () => {
        const recipe = stackOver([input('i-1', ASSET_A, ['red']), input('i-2', ASSET_B, ['swir'])])
        recipe.model.bandNames.bandNames = recipe.model.bandNames.bandNames.filter(({imageId}) => imageId !== 'i-1')
        return recipe
    }

    it('marks Band names at once, naming the input', async () => {
        await open(unmapped())

        expect(bandNamesMark()).toEqual({item: ASSET_A, message: expect.stringContaining('process.stack.panel.bandNames.problem.unmapped')})
    })

    it('is offered its bands to name in the panel, mapped once they are named and applied', async () => {
        await open(unmapped())
        await openBandNames()
        expect(nameFields()).toEqual([
            {value: '', error: expect.stringContaining('fieldValidation.notBlank')},
            {value: 'swir', error: null}
        ])

        await typeName(0, 'elevation')
        await apply()

        expect(bandNamesInError()).toBe(false)
        expect(model().bandNames.bandNames).toEqual([
            {imageId: 'i-2', bands: [{id: 'i-2-swir', originalName: 'swir', outputName: 'swir'}]},
            {imageId: 'i-1', bands: [{id: 'i-1-red', originalName: 'red', outputName: 'elevation'}]}
        ])
    })
})

// The mapping is refused from the configuration alone; the editor still reads the inputs to say what else needs repair.
describe('band names saved alike beside an input lacking a band', () => {
    const both = async () => {
        await open(named(stackOver([input('i-1', ASSET_A, ['red', 'nir']), input('i-2', ASSET_B, ['swir'])]), {'i-2-swir': 'red'}))
        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})
        expect(bandNamesInError()).toBe(true)
        expect(inputsInError()).toEqual([ASSET_A])
    }

    it('leaves the input marked when the band names are repaired', async () => {
        await both()
        await openBandNames()

        await typeName(2, 'swir')
        await apply()
        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})

        expect(nameFields().map(({error}) => error)).toEqual([null, null, null])
        expect(bandNamesInError()).toBe(false)
        expect(inputImageryInError()).toBe(true)
        expect(markedInputs()).toEqual([{name: ASSET_A, bands: 'nir'}])
    })

    it('leaves Band names marked, and the names refused in their fields, when the input is repaired', async () => {
        await both()

        await setModel(model => {
            const images = [{...model.inputImagery.images[0], includedBands: model.inputImagery.images[0].includedBands.slice(0, 1)}, model.inputImagery.images[1]]
            return {...model, inputImagery: {images}, bandNames: {bandNames: toBandNames(images, model.bandNames.bandNames)}}
        })
        await answer({[ASSET_A]: ['red'], [ASSET_B]: ['swir']})

        expect(inputImageryInError()).toBe(false)
        expect(bandNamesInError()).toBe(true)
        await openBandNames()
        expect(nameFields().map(({error}) => error)).toEqual([
            expect.stringContaining('process.stack.panel.bandNames.duplicateBand'),
            expect.stringContaining('process.stack.panel.bandNames.duplicateBand')
        ])
    })
})

describe('an input Stack whose own band names are refused', () => {
    it('leaves the diagnosis with that recipe, marking neither section of this one', async () => {
        const inner = {...named(stackOver([input('i-1', ASSET_A, ['red', 'nir'])]), {'i-1-nir': 'red'}), id: 'inner'}
        await open(stackOver([recipeInput('i-1', inner.id, ['red'])]), [inner])

        await answer({[ASSET_A]: ['red', 'nir']})

        expect(bandNamesInError()).toBe(false)
        expect(inputImageryInError()).toBe(false)
    })
})

const input = (imageId, id, bands) => ({
    imageId, type: 'ASSET', id, includedBands: bands.map(band => ({id: `${imageId}-${band}`, band}))
})

const recipeInput = (imageId, id, bands) => ({...input(imageId, id, bands), type: 'RECIPE_REF'})

// Stack over these inputs, mapping every band each includes under the band's own name.
const stackOver = images => ({
    id: ID,
    type: 'STACK',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images},
        bandNames: {bandNames: images.map(({imageId, includedBands}) => ({
            imageId,
            bands: includedBands.map(({id, band}) => ({id, originalName: band, outputName: band}))
        }))}
    }
})

// The same Stack with some bands, by id, given these output names.
const named = (recipe, outputNames) => ({
    ...recipe,
    model: {...recipe.model, bandNames: {bandNames: recipe.model.bandNames.bandNames.map(entry => ({
        ...entry,
        bands: entry.bands.map(band => band.id in outputNames ? {...band, outputName: outputNames[band.id]} : band)
    }))}}
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
    await act(async () => root.render(tree()))
    await settled()
}

const tree = () =>
    <Provider store={store}>
        <SourceRuntimeProvider>
            <Recipe id={ID}>
                <Runtime/>
                <EventShield>
                    <PortalContainer/>
                    <PortalContainer id='panels'/>
                    <PortalContext id='panels'>
                        <StackToolbar/>
                    </PortalContext>
                </EventShield>
            </Recipe>
        </SourceRuntimeProvider>
    </Provider>

// Band names opened, as its button opens it.
async function openBandNames() {
    panels.open.add('bandNames')
    await act(async () => root.render(tree()))
    await settled()
}

// A new name typed into the band name field at this position.
async function typeName(index, name) {
    const field = nameInputs()[index]
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, name)
        field.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

async function closeBandNames() {
    panels.open.delete('bandNames')
    await act(async () => root.render(tree()))
    await settled()
}

async function cancel() {
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'button.cancel').click())
    await settled()
}

async function apply() {
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'button.apply').click())
    await settled()
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

// The model as its panels would leave it.
async function setModel(change) {
    const model = selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])
    await act(async () => actionBuilder('SET_MODEL')
        .set(['process.loadedRecipes', ID, 'model'], change(model))
        .dispatch())
    await settled()
}

const waiting = () => earthEngine.requests.filter(({subscriber}) => !subscriber.closed)

// Answers every asset request still waiting with the asset's bands, or failing with an Error.
async function answer(assets) {
    await act(async () => waiting().forEach(({request, subscriber}) => {
        const bands = assets[request.asset]
        if (bands instanceof Error) {
            subscriber.error(bands)
        } else if (bands) {
            subscriber.next(bands.map(name => ({name, arrayDimensions: 0})))
            subscriber.complete()
        }
    }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const MISSING = 'process.panels.inputImagery.form.missingBands'

const tooltipLines = element => [...element.querySelectorAll('[data-tooltip]')]
    .flatMap(tooltip => JSON.parse(tooltip.dataset.tooltip))

const valuesOf = (line, key) => JSON.parse(line.slice(key.length + 1))

// The inputs whose rows say they lack bands, by the asset each row shows, with the bands they name.
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

// The inputs whose rows are in their list's error state, by the asset each shows.
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
    .map(({id}) => id)

// The row showing an input: the element around the asset's id holding one remove button.
const rowOf = name => [...document.querySelectorAll('svg[data-icon="trash"]')]
    .map(icon => ancestors(icon).find(element => element.textContent.includes(name)
        && element.querySelectorAll('svg[data-icon="trash"]').length === 1))
    .find(Boolean)

const ancestors = element => element.parentElement ? [element.parentElement, ...ancestors(element.parentElement)] : []

// The band name fields of the open Band names panel, in the order shown: what each holds, and the error it shows.
const nameInputs = () => [...document.querySelectorAll('input')]

const nameFields = () => nameInputs().map(field => {
    const widget = ancestors(field).find(element => element.querySelector('[data-feedback]') || element.querySelectorAll('input').length > 1)
    const feedback = widget?.querySelectorAll('input').length === 1 && widget.querySelector('[data-feedback="error"]')
    const lines = feedback ? JSON.parse(feedback.closest('[data-tooltip]').dataset.tooltip) : []
    return {value: field.value, error: lines.length ? lines.join(' | ') : null}
})

const bandNamesButton = () => [...document.querySelectorAll('button')]
    .find(button => button.textContent.includes('process.stack.panel.bandNames.button'))

// Whether the Band names toolbar button is in its error state.
const bandNamesInError = () => bandNamesButton().classList.contains(classOf(toolbarButtonStyles, 'error'))

// What the Band names button says needs repair, or null when it says nothing of it.
const bandNamesMark = () => {
    const line = [...document.querySelectorAll('[data-tooltip]')]
        .filter(element => element.contains(bandNamesButton()))
        .flatMap(element => JSON.parse(element.dataset.tooltip))
        .find(line => line.startsWith('process.requirement.itemProblem'))
    return line ? valuesOf(line, 'process.requirement.itemProblem') : null
}
