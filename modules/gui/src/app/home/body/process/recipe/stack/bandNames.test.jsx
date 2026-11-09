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

// How a Stack's band names follow its inputs and the names the user gives, through the real toolbar, input list and
// Band names panel over a real store: every commit names the bands it leaves in its own action, and opening the
// recipe, reading its inputs or opening Band names names none. A name the user clears is named automatically; names the
// user gives alike are refused; a name that would read another band says so before Apply. This Stack's visualizations
// follow its bands' names. Earth Engine answers each asset's bands when a test says so.

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
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// The Input imagery list is open, and Band names once a test opens it; no button is pressed.
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
const {commitRecipe} = await import('~/app/home/body/process/recipe/editing/derivedResult')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(stack())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, modelWrites

beforeEach(() => {
    earthEngine.requests = []
    panels.open.clear()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a commit changing the inputs', () => {
    it('names an input\'s bands in the action applying it, apart from the names other bands hold', async () => {
        await open(stackOver([dem]))

        await applyInputs([dem, lidar])

        expect(modelWrites).toHaveLength(1)
        expect(entryOf('i-2')).toEqual({imageId: 'i-2', bands: [automatic('i-2', 'elevation', 'elevation_1')]})
    })

    it('drops a removed input\'s band names in the action removing it, the others kept', async () => {
        await open(stackOver([dem, lidar]))

        await removeInput(DEM)

        expect(modelWrites).toHaveLength(1)
        expect(model().bandNames.bandNames).toEqual([{imageId: 'i-2', bands: [automatic('i-2', 'elevation', 'elevation_1')]}])
    })
})

describe('a Stack opened', () => {
    it('names nothing as it opens, as its inputs are read, nor when Band names opens and closes unedited', async () => {
        const saved = {...stackOver([dem]), model: {
            inputImagery: {images: [dem]},
            bandNames: {bandNames: [
                {imageId: 'i-1', bands: [{id: 'i-1-elevation', originalName: 'elevation', outputName: 'elevation_1'}]},
                {imageId: 'removed', bands: [{id: 'removed-red', originalName: 'red', outputName: 'red'}]}
            ]}
        }}
        await open(saved)

        await answer({[DEM]: ['elevation']})
        await openBandNames()
        await closeBandNames()

        expect(modelWrites).toEqual([])
        expect(model()).toEqual(saved.model)
    })
})

describe('Band names', () => {
    it('shows a name the user clears as the one it is given automatically, applied so', async () => {
        await open(named(stackOver([dem]), {'i-1-elevation': 'dem'}))
        await openBandNames()

        await typeName(0, '')
        expect(nameFields()).toEqual([field({placeholder: 'elevation'})])
        await apply()

        expect(modelWrites).toHaveLength(1)
        expect(entryOf('i-1').bands).toEqual([automatic('i-1', 'elevation')])
    })

    it('refuses names the user gives alike at both, holding Apply and Enter', async () => {
        const recipe = named(stackOver([input('i-1', DEM, ['red']), input('i-2', LIDAR, ['nir'])]), {'i-1-red': 'red'})
        await open(recipe)
        await openBandNames()

        await typeName(1, 'red')

        expect(nameFields().map(({error}) => error)).toEqual([DUPLICATE, DUPLICATE])
        expect(nameFields().map(({warning}) => warning)).toEqual([null, null])
        expect(applyButton().disabled).toBe(true)
        await submit()
        expect(model()).toEqual(recipe.model)
    })

    it('refuses a name a band would be given automatically past the length allowed, holding Apply and Enter', async () => {
        const long = 'a'.repeat(30)
        const recipe = named(stackOver([input('i-1', DEM, ['red']), input('i-2', LIDAR, [long])]), {'i-1-red': long, [`i-2-${long}`]: 'height'})
        await open(recipe)
        await openBandNames()

        await typeName(0, '')
        await typeName(1, '')

        expect(nameFields()[1]).toEqual(field({placeholder: `${long}_1`, error: INVALID_FORMAT}))
        expect(applyButton().disabled).toBe(true)
        await submit()
        expect(model()).toEqual(recipe.model)
    })

    it('says, before Apply, which band a name will read where it takes the name of another band', async () => {
        await open(stackOver([dem, input('i-2', LIDAR, ['height'])]))
        await openBandNames()

        await typeName(1, 'elevation')

        expect(nameFields()).toEqual([
            field({placeholder: 'elevation_1', warning: `${DISPLACED} {"name":"elevation_1","previousName":"elevation"}`}),
            field({value: 'elevation', placeholder: 'height', warning: `${TAKES_NAME} {"name":"elevation"}`})
        ])
        await apply()
        expect(model().bandNames.bandNames.flatMap(({bands}) => bands.map(({outputName}) => outputName)))
            .toEqual(['elevation_1', 'elevation'])
    })
})

describe('Band names over saved names', () => {
    it('shows and keeps a name saved without its band\'s id, as an edit to another is applied', async () => {
        const recipe = named(stackOver([dem, input('i-2', LIDAR, ['height'])]), {'i-1-elevation': 'dem'})
        delete recipe.model.bandNames.bandNames[0].bands[0].id
        await open(recipe)
        await openBandNames()
        expect(nameFields()[0].value).toBe('dem')

        await typeName(1, 'lidar')
        await apply()

        expect(entryOf('i-1').bands).toEqual([{id: 'i-1-elevation', originalName: 'elevation', outputName: 'dem'}])
    })

    it('offers the bands of an input whose saved names it cannot tell apart to name, holding Apply until they are', async () => {
        const recipe = stackOver([input('i-1', DEM, ['red']), input('i-2', LIDAR, ['height'])])
        recipe.model.bandNames.bandNames[0].bands = [{originalName: 'red', outputName: 'a'}, {originalName: 'red', outputName: 'b'}]
        await open(recipe)
        await openBandNames()

        await typeName(1, 'lidar')
        expect(nameFields()[0]).toEqual(field({placeholder: 'red', error: UNRESOLVED}))
        expect(applyButton().disabled).toBe(true)
        await typeName(0, 'c')
        await apply()

        expect(entryOf('i-1').bands).toEqual([{id: 'i-1-red', originalName: 'red', outputName: 'c'}])
    })

    it('holds a submission whose name would read another band than shown, showing what it would read', async () => {
        await open(stackOver([dem]))
        await openBandNames()
        await typeName(0, 'chosen')
        expect(nameFields()[0].warning).toBe(null)

        await act(async () => {
            actionBuilder('RETIRED_ELSEWHERE')
                .set(['process.loadedRecipes', ID, 'model.bandNames.retired'], [{name: 'chosen', source: `ASSET:${LIDAR}`, band: 'elevation'}])
                .dispatch()
            nameInputs()[0].closest('form').requestSubmit()
        })
        await settled()

        expect(entryOf('i-1').bands).toEqual([automatic('i-1', 'elevation')])
        expect(nameFields()[0].warning).toBe(`${TAKES_NAME} {"name":"chosen"}`)
    })
})

describe('this Stack\'s visualizations', () => {
    it('follow its bands as they are renamed', async () => {
        await open(withVisualizations(stackOver([dem, input('i-2', LIDAR, ['height'])]), [['elevation'], ['height']]))
        await openBandNames()

        await typeName(1, 'elevation')
        await apply()

        expect(visualizedBands()).toEqual([['elevation_1'], ['elevation']])
    })

    it('follow a band saved without its id as it is renamed', async () => {
        const recipe = withVisualizations(named(stackOver([dem]), {'i-1-elevation': 'dem'}), [['dem']])
        delete recipe.model.bandNames.bandNames[0].bands[0].id
        await open(recipe)
        await openBandNames()

        await typeName(0, 'renamed')
        await apply()

        expect(visualizedBands()).toEqual([['renamed']])
    })

    it('keep the styles of an input whose saved names cannot be told apart as another input is added', async () => {
        const recipe = withVisualizations(stackOver([input('i-1', DEM, ['red'])]), [['a'], ['b']])
        recipe.model.bandNames.bandNames[0].bands = [{originalName: 'red', outputName: 'a'}, {originalName: 'red', outputName: 'b'}]
        await open(recipe)

        await applyInputs([...recipe.model.inputImagery.images, lidar])

        expect(visualizedBands()).toEqual([['a'], ['b']])
    })

    it('follow a band known by its id as it is renamed, while another of its input\'s bands is told apart', async () => {
        const recipe = withVisualizations(stackOver([input('i-1', DEM, ['red', 'nir'])]), [['known'], ['a'], ['b']])
        recipe.model.bandNames.bandNames[0].bands = [
            {id: 'i-1-red', originalName: 'red', outputName: 'known'},
            {originalName: 'nir', outputName: 'a'},
            {originalName: 'nir', outputName: 'b'}
        ]
        await open(recipe)
        await openBandNames()

        await typeName(0, 'renamed')
        await typeName(1, 'resolved')
        await apply()

        expect(visualizedBands()).toEqual([['renamed'], ['a'], ['b']])
    })

    it('keep a removed band\'s style as it was', async () => {
        await open(withVisualizations(stackOver([dem, lidar]), [['elevation'], ['elevation_1']]))

        await removeInput(DEM)

        expect(visualizedBands()).toEqual([['elevation'], ['elevation_1']])
    })
})

const ID = 'stack-1'
const LISTING = [{id: ID, name: 'Stack', type: 'STACK', revision: 1}]
const DEM = 'users/x/dem'
const LIDAR = 'users/x/lidar'
const DUPLICATE = 'process.stack.panel.bandNames.duplicateBand'
const DISPLACED = 'process.stack.panel.bandNames.displaced'
const TAKES_NAME = 'process.stack.panel.bandNames.takesName'
const UNRESOLVED = 'process.stack.panel.bandNames.unresolved'
const INVALID_FORMAT = 'process.stack.panel.bandNames.invalidFormat'

const input = (imageId, id, bands) => ({
    imageId, type: 'ASSET', id, includedBands: bands.map(band => ({id: `${imageId}-${band}`, band}))
})

const dem = input('i-1', DEM, ['elevation'])
const lidar = input('i-2', LIDAR, ['elevation'])

const automatic = (imageId, band, outputName = band) =>
    ({id: `${imageId}-${band}`, originalName: band, outputName, automaticName: outputName})

// A Stack over these inputs, named automatically as they were added.
const stackOver = images => ({
    id: ID,
    type: 'STACK',
    revision: 1,
    ui: {initialized: true},
    model: {
        inputImagery: {images},
        bandNames: {bandNames: images.reduce((entries, {imageId, includedBands}) => {
            const taken = entries.flatMap(({bands}) => bands.map(({outputName}) => outputName))
            return [...entries, {imageId, bands: includedBands.map(({band}) => {
                const outputName = taken.includes(band) ? `${band}_1` : band
                return automatic(imageId, band, outputName)
            })}]
        }, [])}
    }
})

// The same Stack with some bands, by id, given these names by the user.
const named = (recipe, outputNames) => ({
    ...recipe,
    model: {...recipe.model, bandNames: {bandNames: recipe.model.bandNames.bandNames.map(entry => ({
        ...entry,
        bands: entry.bands.map(({automaticName: _automaticName, ...band}) => band.id in outputNames
            ? {...band, outputName: outputNames[band.id]}
            : {...band, automaticName: band.outputName})
    }))}}
})

const withVisualizations = (recipe, bandLists) => ({
    ...recipe,
    layers: {userDefinedVisualizations: {'this-recipe': bandLists.map((bands, index) => ({id: `v-${index}`, type: 'continuous', bands}))}}
})

async function open(recipe) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    modelWrites = []
    store = createStore((state = initialState, action) => {
        const next = action.reduce ? action.reduce(state) : state
        if (selectFrom(next, ['process.loadedRecipes', ID, 'model']) !== selectFrom(state, ['process.loadedRecipes', ID, 'model'])) {
            modelWrites.push(action.type)
        }
        return next
    })
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

// The inputs as the input editor applies them: committed, with what the commit derives.
async function applyInputs(images) {
    await act(async () => commitRecipe(['process.loadedRecipes', ID], actionBuilder('SET_MODEL_AND_VALUES')
        .set(['process.loadedRecipes', ID, 'model.inputImagery.images'], images)))
    await settled()
}

// An input removed from the list, its removal confirmed.
async function removeInput(name) {
    await press(rowOf(name).querySelector('svg[data-icon="trash"]').closest('button'))
    await press([...document.querySelectorAll('button')].find(button => button.textContent === 'button.remove'))
}

async function openBandNames() {
    panels.open.add('bandNames')
    await act(async () => root.render(tree()))
    await settled()
}

async function closeBandNames() {
    panels.open.delete('bandNames')
    await act(async () => root.render(tree()))
    await settled()
}

// A name typed into the band name field at this position, replacing what it held.
async function typeName(index, name) {
    const nameInput = nameInputs()[index]
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nameInput, name)
        nameInput.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

const applyButton = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'button.apply')

async function apply() {
    await act(async () => applyButton().click())
    await settled()
}

// Enter in a band name field: it submits the panel's form.
async function submit() {
    await act(async () => nameInputs()[0].closest('form').requestSubmit())
    await settled()
}

async function press(element) {
    await act(async () => ['mouseenter', 'mousedown', 'mouseup', 'click']
        .forEach(type => element.dispatchEvent(new MouseEvent(type, {bubbles: true}))))
    await settled()
}

// Answers every asset request still waiting with the asset's bands.
async function answer(assets) {
    await act(async () => earthEngine.requests
        .filter(({subscriber, request}) => !subscriber.closed && assets[request.asset])
        .forEach(({request, subscriber}) => {
            subscriber.next(assets[request.asset].map(name => ({name, arrayDimensions: 0})))
            subscriber.complete()
        }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const entryOf = imageId => model().bandNames.bandNames.find(entry => entry.imageId === imageId)

const visualizedBands = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'layers.userDefinedVisualizations'])['this-recipe']
    .map(({bands}) => bands)

// The row showing an input: the element around the asset's id holding one remove button.
const rowOf = name => [...document.querySelectorAll('svg[data-icon="trash"]')]
    .map(icon => ancestors(icon).find(element => element.textContent.includes(name)
        && element.querySelectorAll('svg[data-icon="trash"]').length === 1))
    .find(Boolean)

const ancestors = element => element.parentElement ? [element.parentElement, ...ancestors(element.parentElement)] : []

const nameInputs = () => [...document.querySelectorAll('input')]

const field = ({value = '', placeholder, error = null, warning = null}) => ({value, placeholder, error, warning})

// The band name fields of the open Band names panel, in the order shown: what each holds, shows when empty, and the
// error and warning it shows.
const nameFields = () => nameInputs().map(nameInput => {
    const widget = ancestors(nameInput).find(element => element.querySelector('[data-feedback]') || element.querySelectorAll('input').length > 1)
    const feedback = severity => {
        const indicator = widget?.querySelectorAll('input').length === 1 && widget.querySelector(`[data-feedback="${severity}"]`)
        const lines = indicator ? JSON.parse(indicator.closest('[data-tooltip]').dataset.tooltip) : []
        return lines.length ? lines.join(' | ') : null
    }
    return {value: nameInput.value, placeholder: nameInput.placeholder, error: feedback('error'), warning: feedback('warning')}
})
