import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'

// What Class Change and Index Change say of an image whose selection their output read refuses (changeImageRequirements.js):
// its section's toolbar button marks it, Retrieve is refused and previews withdrawn, naming the section, while the panel
// editing the image keeps what was saved and says beside each field what it lacks, until a repair is applied. What is not
// established - a source still being read, or one that could not be - refuses nothing. The real toolbars and image
// panels over a real store and source runtime; Earth Engine and recipe storage answer when a test says so.

const fake = vi.hoisted(() => ({requests: [], records: {}, missingAssets: new Set(), versionsHeld: false}))
vi.mock('~/apiRegistry', async () => {
    const {map, NEVER, of, Subject, throwError} = await import('rxjs')
    const request = key => {
        const answer$ = new Subject()
        fake.requests.push({key, answer$})
        return answer$
    }
    return {default: {
        recipe: {
            save$: () => NEVER,
            // A record a test does not hold is answered when the test says so.
            load$: id => !(id in fake.records) ? request(`load:${id}`)
                : fake.records[id] instanceof Error ? throwError(() => fake.records[id]) : of(fake.records[id]),
            loadAll$: () => of(LISTING)
        },
        gee: {
            assetMetadata$: ({asset}) => request(`metadata:${asset}`),
            // Asset versions are answered at once, unless a test holds them until it says.
            assetVersions$: ({ids}) => (fake.versionsHeld ? request('versions') : of(true)).pipe(map(() => ({assets: ids.map(id =>
                fake.missingAssets.has(id) ? {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}} : {id, type: 'IMAGE', version: 'v1'}
            )}))),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: ({asset, recipe}) => request(`bands:${asset || recipe.id}`)
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// The panels a test opens are open until applied or cancelled; no other is.
const panels = vi.hoisted(() => ({open: new Set()}))
vi.mock('~/widget/activation/activatable', async () => {
    const React = await import('react')
    return {
        withActivatable: ({id}) => Component => class extends React.Component {
            state = {active: true}

            render() {
                return panels.open.has(id) && this.state.active
                    ? <Component {...this.props} activatable={{
                        active: true, activate: () => this.setState({active: true}), deactivate: () => this.setState({active: false})
                    }}/>
                    : null
            }
        }
    }
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classChange} = await import('./classChange/classChange')
const {default: indexChange} = await import('./indexChange/indexChange')
const {ClassChangeToolbar} = await import('./classChange/panels/classChangeToolbar')
const {IndexChangeToolbar} = await import('./indexChange/panels/indexChangeToolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {retrieveAvailability} = await import('./operationAvailability')
const {readRetrieveOutput} = await import('./retrieveOutput')
const {readOutputRequirements, requestGate} = await import('./sourceRequirements')
const {sourceProblemsOfState} = await import('./selectedSourceStatus')

addRecipeType(classChange())
addRecipeType(indexChange())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'change-1'
const FROM = 'users/x/from'
const TO = 'users/x/to'
const LISTING = [{id: ID, name: 'Change', type: 'CLASS_CHANGE', revision: 1}, {id: 'upstream-1', name: 'Upstream', type: 'CLASS_CHANGE', revision: 1}]

let root, store, runtime

beforeEach(() => {
    fake.requests = []
    fake.records = {}
    fake.missingAssets = new Set()
    fake.versionsHeld = false
    panels.open.clear()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

const RECIPES = [
    ['CLASS_CHANGE', 'classChange', () => ClassChangeToolbar],
    ['INDEX_CHANGE', 'indexChange', () => IndexChangeToolbar]
]

describe.each(RECIPES)('a %s image whose source no longer provides its band', (type, name, toolbar) => {
    const FROM_SECTION = `process.${name}.panel.inputImage.from.button.label`

    it('marks its section, refuses Retrieve and withdraws previews, naming that section; the other image is not marked', async () => {
        await open(toolbar(), recipeOf(type))

        await answer({[`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.unavailableBands')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(retrieveRead().output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: FROM_SECTION}])
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('refuses nothing while its source is read, nor once the read fails', async () => {
        await open(toolbar(), recipeOf(type))
        expect(sectionMark('fromImage')).toBeNull()
        expect(previewGate()).toMatchObject({wait: true, withdraw: false})

        await answer({[`bands:${FROM}`]: new Error('Earth Engine unreachable'), [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBeNull()
        expect(previewGate()).toMatchObject({withdraw: false})
    })

    it('keeps the saved band in its editor, refused beside its field, until one the source provides is applied', async () => {
        await open(toolbar(), recipeOf(type), ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['other']), [`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        expect(fieldValue(BAND_FIELD[name])).toBe('band')
        expect(fieldErrors(BAND_FIELD[name])).toEqual([expect.stringContaining('process.requirement.inputImage.field.unavailableBand')])
        expect(applyEnabled()).toBe(false)

        await choose(BAND_FIELD[name], 'other')
        expect(fieldErrors(BAND_FIELD[name])).toEqual([])
        expect(retrieveAvailable()).toBe(false)
        await apply()

        expect(model().fromImage.band).toBe('other')
        expect(sectionMark('fromImage')).toBeNull()
        expect(retrieveAvailable()).toBe(true)
    })

    it('is left as saved when an edit is cancelled', async () => {
        const recipe = recipeOf(type)
        await open(toolbar(), recipe, ['fromImage'])
        await answer({[`metadata:${FROM}`]: metadata(['other']), [`bands:${FROM}`]: ['other'], [`bands:${TO}`]: ['band']})

        await choose(BAND_FIELD[name], 'other')
        await cancel()

        expect(model()).toEqual(recipe.model)
        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.unavailableBands')
    })

    it('keeps its saved band, offered, while its source is read again and when that read fails', async () => {
        await open(toolbar(), recipeOf(type), ['fromImage'])
        expect(fieldValue(BAND_FIELD[name])).toBe('band')

        await answer({[`metadata:${FROM}`]: new Error('Earth Engine unreachable')})

        expect(fieldValue(BAND_FIELD[name])).toBe('band')
        expect(model()).toEqual(recipeOf(type).model)
    })
})

describe('an INDEX_CHANGE image whose source no longer provides its error band', () => {
    it('marks its section, and its editor refuses the error band beside its field alone', async () => {
        const recipe = recipeOf('INDEX_CHANGE', {toImage: {...IMAGE(TO, 'INDEX_CHANGE'), errorBand: 'rmse'}})
        await open(IndexChangeToolbar, recipe, ['toImage'])

        await answer({[`metadata:${TO}`]: metadata(['band']), [`bands:${FROM}`]: ['band'], [`bands:${TO}`]: ['band']})

        expect(sectionMark('toImage')).toBe('process.requirement.inputImage.unavailableBands')
        expect(fieldValue(ERROR_BAND_FIELD)).toBe('rmse')
        expect(fieldErrors(ERROR_BAND_FIELD)).toEqual([expect.stringContaining('process.requirement.inputImage.field.unavailableBand')])
        expect(fieldErrors(BAND_FIELD.indexChange)).toEqual([])
    })
})

describe('a CLASS_CHANGE image selecting a recipe storage no longer holds', () => {
    it('marks its section, refuses Retrieve and withdraws previews, and its editor keeps the selection, saying so', async () => {
        fake.records['deleted-1'] = notFound()
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}), ['fromImage'])

        await answer({[`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: 'process.classChange.panel.inputImage.from.button.label'})
        expect(fieldValue(RECIPE_FIELD)).toBe('widget.recipeInput.unlisted')
        expect(fieldErrors(RECIPE_FIELD)).toEqual(['process.requirement.inputImage.field.missingRecipe'])
    })

    it('is not marked, nor its previews withdrawn, where the recipe could not be read for another reason, which its editor says', async () => {
        fake.records['deleted-1'] = Object.assign(new Error('Service unavailable'), {status: 503})
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}), ['fromImage'])

        await answer({[`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: false})
        expect(fieldErrors(RECIPE_FIELD)).toEqual(['widget.recipeInput.loadError'])
    })
})

// Both images select recipes, read together: only the one whose own read is answered not there is marked; the other
// stays unknown. A failed read ends the others, so a recipe whose read another's failure ended is not known missing.
describe('a CLASS_CHANGE image whose recipe is gone, beside another selecting a recipe', () => {
    const FROM_SECTION = 'process.classChange.panel.inputImage.from.button.label'
    const BOTH = {
        fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'},
        toImage: {...IMAGE(TO), type: 'RECIPE_REF', id: 'other-1'}
    }

    it('alone is marked while the other is still being read', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:deleted-1': notFound()})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('alone is marked where the other then fails for a reason that may not repeat', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:deleted-1': notFound()})
        await answer({'load:other-1': unavailable()})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: FROM_SECTION})
    })

    it('is not marked, nor is the other, where the other first fails for a reason that may not repeat', async () => {
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', BOTH))

        await answer({'load:other-1': unavailable()})
        await answer({'load:deleted-1': notFound()})

        expect(sectionMark('fromImage')).toBeNull()
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: false})
    })
})

describe('a CLASS_CHANGE image selecting an asset found missing', () => {
    it('marks its section, refuses Retrieve and withdraws previews, and its editor says so beside the asset', async () => {
        fake.missingAssets.add(FROM)
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE'), ['fromImage'])

        await answer({[`metadata:${FROM}`]: new Error(`Asset not found: ${FROM}`), [`bands:${TO}`]: ['band']})

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingAsset')
        expect(sectionMark('toImage')).toBeNull()
        expect(retrieveAvailable()).toBe(false)
        expect(previewGate()).toMatchObject({withdraw: true, section: 'process.classChange.panel.inputImage.from.button.label'})
        expect(fieldErrors(ASSET_FIELD)).toContain('process.requirement.inputImage.field.missingAsset')
    })
})

describe('a CLASS_CHANGE image whose recipe is gone, beside one selecting an asset found missing', () => {
    it.each([
        ['the asset', 'fromImage', () => answer({'load:deleted-1': notFound()}), () => answer({versions: true})],
        ['the recipe', 'toImage', () => answer({versions: true}), () => answer({'load:deleted-1': notFound()})]
    ])('both are marked, %s found missing last', async (_last, foundFirst, first, last) => {
        fake.versionsHeld = true
        fake.missingAssets.add(TO)
        await open(ClassChangeToolbar, recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'deleted-1'}}))
        await first()
        expect(['fromImage', 'toImage'].filter(id => sectionMark(id))).toEqual([foundFirst])

        await last()

        expect(sectionMark('fromImage')).toBe('process.requirement.inputImage.missingRecipe')
        expect(sectionMark('toImage')).toBe('process.requirement.inputImage.missingAsset')
        expect(retrieveAvailable()).toBe(false)
    })
})

describe('a missing recipe found in a CLASS_CHANGE recipe\'s closure', () => {
    it('is that recipe\'s own where its own edge names it, and the recipe it lies under\'s otherwise', () => {
        const recipe = recipeOf('CLASS_CHANGE', {fromImage: {...IMAGE(FROM), type: 'RECIPE_REF', id: 'upstream-1'}})

        const own = reads(recipe, missing([ID, 'upstream-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'upstream-1'))
        const upstream = reads(recipe, missing([ID, 'upstream-1', 'deleted-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'deleted-1'))
        const elsewhere = reads(recipe, missing([ID, 'upstream-1'], ['model', 'toImage'], 'FROM_IMAGE', 'upstream-1'))
        const otherFailed = reads(recipe, missing([ID, 'upstream-1'], ['model', 'fromImage'], 'FROM_IMAGE', 'another-1'))

        expect(own.map(({item, outputState}) => item?.id || outputState)).toEqual(['fromImage', true])
        expect(upstream.map(({item, outputState}) => item?.id || outputState)).toEqual([true, true])
        expect(elsewhere.map(({item, outputState}) => item?.id || outputState)).toEqual([true, true])
        expect(otherFailed.map(({item, outputState}) => item?.id || outputState)).toEqual([true, true])
    })
})

const BAND_FIELD = {
    classChange: 'process.classChange.panel.inputImage.changeBand.label',
    indexChange: 'process.indexChange.panel.inputImage.changeBand.label'
}
const ERROR_BAND_FIELD = 'process.indexChange.panel.inputImage.errorBand.label'
const RECIPE_FIELD = 'process.classChange.panel.inputImage.image.label'
const ASSET_FIELD = RECIPE_FIELD

const LEGEND = [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]

// An image as each type saves it: Class Change keeps its source's bands with their styles, and a legend; Index Change
// keeps their names.
const IMAGE = (id, type = 'CLASS_CHANGE') => type === 'CLASS_CHANGE'
    ? {type: 'ASSET', id, band: 'band', bands: {band: {values: [1, 2]}}, legendEntries: LEGEND}
    : {type: 'ASSET', id, band: 'band', bands: ['band']}

const recipeOf = (type, model = {}) => ({
    id: ID,
    type,
    revision: 1,
    ui: {initialized: true},
    model: {
        fromImage: IMAGE(FROM, type),
        toImage: IMAGE(TO, type),
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        legend: {entries: []},
        options: {minConfidence: 0},
        ...model
    }
})

const notFound = () => Object.assign(new Error('Not found'), {status: 404})

const unavailable = () => Object.assign(new Error('Service unavailable'), {status: 503})

// An asset's metadata: its bands, each a classification with two classes.
const metadata = bands => ({
    type: 'Image',
    bandNames: bands,
    bands: bands.map(id => ({id, data_type: {type: 'PixelType', precision: 'int'}})),
    properties: Object.fromEntries(bands.flatMap(band => [
        [`${band}_class_names`, ['A', 'B']], [`${band}_class_values`, [1, 2]], [`${band}_class_palette`, ['#000000', '#ffffff']]
    ]))
})

// An output read as a recipe whose record is gone leaves it: unreadable, its closure missing that record, the read that
// failed naming the record it could not read.
const missing = (recipePath, path, role, failedRecipe) => ({
    status: 'UNAVAILABLE',
    diagnostics: [],
    error: Object.assign(notFound(), {recipeId: failedRecipe}),
    dependencyValidity: {status: 'UNAVAILABLE', diagnostics: [{code: 'MISSING_SOURCE', role, path, recipePath}]}
})

const reads = (recipe, output) => readOutputRequirements({recipe, output})

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(Toolbar, recipe, openPanels = []) {
    openPanels.forEach(id => panels.open.add(id))
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
    const container = document.createElement('div')
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
                            <Toolbar/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// Answers every request still waiting under each key: a source's bands, or an Error it fails with.
async function answer(answers) {
    await act(async () => fake.requests
        .filter(({key, answer$}) => key in answers && !answer$.isStopped)
        .forEach(({key, answer$}) => {
            const value = answers[key]
            if (value instanceof Error) {
                answer$.error(value)
            } else {
                answer$.next(key.startsWith('bands:') ? value.map(name => ({name, arrayDimensions: 0})) : value)
                answer$.complete()
            }
        }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const recipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const retrieveAvailable = () => retrieveAvailability({
    state: store.getState(), recipe: recipe(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
}).available

const retrieveRead = () => readRetrieveOutput({
    state: store.getState(), recipeId: ID, heldFor: key => runtime.heldFor(key), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id)
})

// Why a new preview of the recipe may not be requested, as a layer showing it asks, on this map or another.
const previewGate = () => requestGate({
    state: store.getState(), recipe: recipe(), operation: 'IMAGE_OUTPUT',
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
})

// What a section's toolbar button says of it while marking it - the section's problem it shows as its tooltip - or null
// where it is not marked.
const sectionMark = id => {
    const button = [...document.querySelectorAll('button')]
        .find(button => button.textContent.includes(`.panel.inputImage.${id === 'fromImage' ? 'from' : 'to'}.button.label`))
    return button.classList.contains(toolbarButtonStyles.error)
        ? sourceProblemsOfState(store.getState(), ID, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))[id]
        : null
}

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field shows selected: a combo shows its selection in place of its placeholder.
const fieldValue = label => {
    const input = field(label).querySelector('input')
    return input.value || (field(label).querySelector('[class*="fakePlaceholder"]') ? input.placeholder : '')
}

// What a field's own feedback says is wrong with it.
const fieldErrors = label => [...field(label).querySelectorAll('[data-tooltip]')]
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .filter(line => line.startsWith('process.requirement') || line.endsWith('.loadError'))

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const choose = async (label, value) => {
    await act(async () => field(label).querySelector('input').click())
    await settled()
    await act(async () => options().find(element => element.textContent === value).click())
    await settled()
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const applyEnabled = () => panelButton('button.apply')?.disabled === false

const apply = async () => {
    await act(async () => panelButton('button.apply').click())
    await settled()
}

const cancel = async () => {
    await act(async () => panelButton('button.cancel').click())
    await settled()
}
