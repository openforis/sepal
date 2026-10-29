import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// A Classification or Regression trained on another recipe's training data, which that recipe cannot produce - it has
// no input imagery to sample its points over (TRAINING_DATA) - or whose imagery lacks a feature it trains on, or matches
// one more than once: the data set reusing it is marked in the Training data panel, naming that recipe; the data sets
// beside it are not. What that recipe's own band sets select plays no part: its points are sampled with the features
// the recipe reusing them defines. A name the recipe's own input images give twice is said at Input imagery. The TRN
// button of either says what holds its training data. No training data at all is set-up not yet done: the panel says how
// to add some, while the button marks nothing wrong. The panels, store, source runtime and recipe types are real; Earth
// Engine answers an asset's bands at once - red and nir, unless `evidence` says otherwise.

const stored = vi.hoisted(() => ({records: {}}))
const evidence = vi.hoisted(() => ({'users/x/red': ['red'], 'users/x/case': ['red', 'Red', 'nir'], 'users/x/again': ['red']}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset}) => of((evidence[asset] || ['red', 'nir']).map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(stored.records[id]), loadAll$: () => of(LISTING)}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))
// The Training data panel is open; the data set editor it opens is not.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id} = {}) => Component => props => id === 'trainingData'
        ? <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{activatables: {}}}/>
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classification} = await import('./classification')
const {default: regression} = await import('../regression/regression')
const {TrainingData: ClassificationTrainingData} = await import('./panels/trainingData/trainingData')
const {TrainingData: RegressionTrainingData} = await import('../regression/panels/trainingData/trainingData')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')
const {retrieveAvailability} = await import('../operationAvailability')

addRecipeType(classification())
addRecipeType(regression())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingData, 'process.classification.panel.trainingData.missing'],
    ['REGRESSION', RegressionTrainingData, 'process.regression.panel.trainingData.missing']
])('a %s trained on a recipe that cannot produce its training data', (type, TrainingData, missing) => {
    it('marks the data set reusing it, naming that recipe, and no other, where that recipe has no input imagery', async () => {
        await open(type, TrainingData, {images: []})

        expect(marked()).toEqual([{item: REUSED, message: expect.stringContaining('"recipe":"Provider"')}])
    })

    it('marks nothing where that recipe selects a band its input does not have, its points sampled as this recipe defines', async () => {
        await open(type, TrainingData, {images: [SELECTING_MISSING_BAND]})

        expect(marked()).toEqual([])
        expect(toolbarProblems()).toEqual({})
    })

    it('says so on its training data button, naming that recipe, as no guidance to add training data', async () => {
        await open(type, TrainingData, {images: []})

        expect(toolbarProblems().trainingData).toContain('"recipe":"Provider"')
        expect(shown()).not.toContain(missing)
    })

    it('marks nothing once that recipe is given input imagery', async () => {
        await open(type, TrainingData, {images: []})

        await act(async () => actionBuilder('REPAIR')
            .set(['process.loadedRecipes', PROVIDER, 'model.inputImagery.images'], [ASSET_IMAGE])
            .dispatch())
        await settled()

        expect(marked()).toEqual([])
    })

    it('marks nothing where that recipe can produce it', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE]})

        expect(marked()).toEqual([])
    })
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingData, 'process.classification.panel.trainingData.missing'],
    ['REGRESSION', RegressionTrainingData, 'process.regression.panel.trainingData.missing']
])('a %s without training data', (type, TrainingData, missing) => {
    it('says how to add some in its Training data panel, marking neither the button nor a data set, and holds its Retrieve', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false, reuse: false})

        expect(shown()).toContain(missing)
        expect(toolbarProblems().trainingData).toBe(undefined)
        expect(marked()).toEqual([])
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: 'process.classification.panel.trainingData.button'})
    })
})

// Neither the consumer nor the recipe it reuses stores a point: it has nothing to train on, which its Training data
// panel says, as the recipe it reuses - able to produce what it stores - is marked for nothing.
describe.each([
    ['CLASSIFICATION', ClassificationTrainingData, 'process.classification.panel.trainingData.missing'],
    ['REGRESSION', RegressionTrainingData, 'process.regression.panel.trainingData.missing']
])('a %s whose reused training data stores no point', (type, TrainingData, missing) => {
    it('holds its Retrieve for its training data, marking no data set', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false})

        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: 'process.classification.panel.trainingData.button'})
        expect(marked()).toEqual([])
    })

    it('says how to add some in its Training data panel, its button unmarked', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false})

        expect(shown()).toContain(missing)
        expect(toolbarProblems().trainingData).toBe(undefined)
    })

    it('can be retrieved once the recipe it reuses stores a point', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false})

        await act(async () => actionBuilder('ADD_POINTS')
            .set(['process.loadedRecipes', PROVIDER, 'model.trainingData.dataSets'], [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: POINTS}])
            .dispatch())
        await settled()

        expect(retrieveGate()).toBe(null)
        expect(shown()).not.toContain(missing)
    })
})

// The imagery of the recipe it reuses holds only red, while it trains on red and nir: the data set reusing it is marked,
// naming that recipe and nir, and the operations over its image are held, until that recipe's imagery holds nir too.
describe.each([
    ['CLASSIFICATION', ClassificationTrainingData],
    ['REGRESSION', RegressionTrainingData]
])('a %s trained on a recipe whose imagery lacks a feature it trains on', (type, TrainingData) => {
    it('marks the data set reusing it, naming that recipe and the feature it lacks, and holds its Retrieve', async () => {
        await open(type, TrainingData, {images: [RED_ONLY]})

        expect(marked()).toEqual([{item: REUSED, message: 'process.classification.panel.trainingData.missingFeatures {"recipe":"Provider","features":"nir"}'}])
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET'})
    })

    it('marks nothing, and can be retrieved, once that recipe\'s imagery holds it', async () => {
        await open(type, TrainingData, {images: [RED_ONLY]})

        await act(async () => actionBuilder('REPAIR')
            .set(['process.loadedRecipes', PROVIDER, 'model.inputImagery.images'], [ASSET_IMAGE])
            .dispatch())
        await settled()

        expect(marked()).toEqual([])
        expect(retrieveGate()).toBe(null)
    })
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingData],
    ['REGRESSION', RegressionTrainingData]
])('a %s trained on a recipe whose imagery matches a feature it trains on more than once', (type, TrainingData) => {
    it('marks the data set reusing it, naming the bands as that recipe spells them and how to tell them apart', async () => {
        await open(type, TrainingData, {images: [{...RED_ONLY, id: 'users/x/case'}]})

        const [{item, message}] = marked()
        expect(item).toBe(REUSED)
        expect(message).toMatch(/^process\.classification\.panel\.trainingData\.ambiguousFeatures .*"recipe":"Provider"/)
        expect(message).toContain('trainingData.conflictInput')
        expect(message).toContain('red, Red')
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET'})
    })
})

describe.each([
    ['CLASSIFICATION', ClassificationTrainingData],
    ['REGRESSION', RegressionTrainingData]
])('a %s two of whose input images give one feature, reusing training data', (type, TrainingData) => {
    it('says so at Input imagery, marking no data set, and holds its Retrieve', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], consumerImages: [ASSET_IMAGE, {...RED_ONLY, imageId: 'i-2', id: 'users/x/again'}]})

        expect(marked()).toEqual([])
        expect(toolbarProblems()).toEqual({inputImagery: 'process.classification.panel.inputImagery.ambiguousFeatures {"features":"red"}'})
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET'})
    })
})

const CONSUMER = 'consumer-1'
const PROVIDER = 'provider-1'
const REUSED = 'Reused'
const COLLECTED = 'Collected'
const ASSET_IMAGE = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
// Earth Engine answers every asset with red and nir alone.
const SELECTING_MISSING_BAND = {...ASSET_IMAGE, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'swir']}]}
// An input over an asset of red alone.
const RED_ONLY = {...ASSET_IMAGE, id: 'users/x/red', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red']}]}
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]

const LISTING = [
    {id: CONSUMER, name: 'Consumer', revision: 1},
    {id: PROVIDER, name: 'Provider', revision: 1}
]

const recipeOf = (type, id, {images = [ASSET_IMAGE], dataSets}) => ({
    id,
    type,
    title: id === PROVIDER ? 'Provider' : 'Consumer',
    revision: 1,
    model: {
        inputImagery: {images},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets}
    },
    ui: {initialized: true}
})

// The consumer, trained on its own points and on the provider's, which is over `images`. `points` false: neither stores
// a point of its own - a Classification keeping the data set its map collects into, empty. `reuse` false: the consumer
// reuses nothing.
const recipesOf = (type, {images, consumerImages, points = true, reuse = true}) => [
    recipeOf(type, CONSUMER, {images: consumerImages, dataSets: [
        ...(points ? [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: POINTS}] : []),
        ...(!points && type === 'CLASSIFICATION' ? [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: []}] : []),
        ...(reuse ? [{dataSetId: 'reused', type: 'RECIPE', name: REUSED, recipe: PROVIDER}] : [])
    ]}),
    recipeOf(type, PROVIDER, {images, dataSets: points ? [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: POINTS}] : []})
]

const shown = () => document.body.textContent

const toolbarProblems = () =>
    sourceProblemsOfState(store.getState(), CONSUMER, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))

// Why Retrieve of the consumer is held, as far as what its type declares decides it.
const retrieveGate = () => retrieveAvailability({
    state: store.getState(),
    recipe: store.getState().process.loadedRecipes[CONSUMER],
    evidenceOwnerOf: id => runtime.evidenceOwnerOf(id),
    heldFor: key => runtime.heldFor(key),
    now: Date.now()
}).gate

// The data sets the list marks with a recipe's problem, by what the list describes each as, and what each says.
const marked = () => [...container.querySelectorAll('[data-tooltip]')]
    .map(element => ({element, message: JSON.parse(element.dataset.tooltip).find(text => ITEM_PROBLEMS.some(prefix => text.startsWith(prefix)))}))
    .filter(({message}) => message)
    .map(({element, message}) => ({item: describedAs(element), message}))

const ITEM_PROBLEMS = ['process.source.status.', 'process.classification.panel.trainingData.missingFeatures', 'process.classification.panel.trainingData.ambiguousFeatures']

const DESCRIPTIONS = [REUSED, COLLECTED, 'process.classification.panel.trainingData.type.COLLECTED.label']

// What the nearest list item holding `element` is described as.
const describedAs = element => {
    const description = ancestor => DESCRIPTIONS.find(text => ancestor.textContent.includes(text))
    let ancestor = element
    while (ancestor && !description(ancestor)) {
        ancestor = ancestor.parentElement
    }
    return ancestor ? description(ancestor) : null
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(type, TrainingData, {images, consumerImages, points, reuse}) {
    const records = recipesOf(type, {images, consumerImages, points, reuse})
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: CONSUMER}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe/>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={CONSUMER}>
                            <TrainingData dataCollectionManager={{updateAll: () => {}}}/>
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
