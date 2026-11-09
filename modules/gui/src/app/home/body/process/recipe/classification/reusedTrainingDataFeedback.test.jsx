import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, of, throwError} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A Classification or Regression trained on another recipe's training data, which that recipe cannot produce - it has
// no input imagery to sample its points over (TRAINING_DATA) - or whose imagery lacks a feature it trains on, or matches
// one more than once: the data set reusing it is marked in the Training data panel, naming that recipe; the data sets
// beside it are not. What that recipe's own band sets select plays no part: its points are sampled with the features
// the recipe reusing them defines. A name the recipe's own input images give twice is said at Input imagery. The TRN
// button of either says what holds its training data. No training data at all is set-up not yet done: the panel says how
// to add some, while the button marks nothing wrong. The panels, store, source runtime and recipe types are real; Earth
// Engine answers an asset's bands at once - red and nir, unless `evidence` says otherwise.

// The records the recipe service holds, and those it is still reading, or cannot.
const stored = vi.hoisted(() => ({records: {}, reading: {}}))
const evidence = vi.hoisted(() => ({'users/x/red': ['red'], 'users/x/case': ['red', 'Red', 'nir'], 'users/x/again': ['red']}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset}) => of((evidence[asset] || ['red', 'nir']).map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {
        load$: id => ({pending: NEVER, unreadable: throwError(() => new Error('unreadable'))})[stored.reading[id]] || of(stored.records[id]),
        loadAll$: () => of(LISTING)
    }
}}))
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(Boolean))}>{children}</span>
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
const {sectionProblemsOfState, sourceProblemsOfState} = await import('../requirements/selectedSourceStatus')
const {retrieveAvailability} = await import('../requirements/operationAvailability')

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
    it('says how to add some in its Training data panel and on its button, as unfinished, marking no data set, and holds its Retrieve', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false, reuse: false})

        expect(shown()).toContain(missing)
        expect(toolbarProblems().trainingData).toBe(missing)
        expect(incompleteSections()).toEqual({trainingData: true})
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

    it('says how to add some in its Training data panel and on its button, as unfinished', async () => {
        await open(type, TrainingData, {images: [ASSET_IMAGE], points: false})

        expect(shown()).toContain(missing)
        expect(toolbarProblems().trainingData).toBe(missing)
        expect(incompleteSections()).toEqual({trainingData: true})
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

// The imagery of the recipe it reuses lacks nir, and gives red twice: the data set reusing it says both, and still says
// one once the other is repaired.
describe.each([
    ['CLASSIFICATION', ClassificationTrainingData],
    ['REGRESSION', RegressionTrainingData]
])('a %s trained on a recipe whose imagery lacks one feature it trains on and matches another more than once', (type, TrainingData) => {
    it('says both at the data set reusing it, naming that recipe', async () => {
        await open(type, TrainingData, {images: [RED_ONLY, RED_AGAIN]})

        const [{item, message}, ...others] = marked()
        expect(others).toEqual([])
        expect(item).toBe(REUSED)
        expect(message).toContain(MISSING_NIR)
        expect(message).toMatch(/process\.classification\.panel\.trainingData\.ambiguousFeatures .*"recipe":"Provider"/)
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET'})
    })

    it.each([
        ['nir given', [ASSET_IMAGE, RED_AGAIN], 'ambiguousFeatures', MISSING_NIR],
        ['red given once', [RED_ONLY], MISSING_NIR, 'ambiguousFeatures']
    ])('still says the other once %s', async (_case, repaired, still, gone) => {
        await open(type, TrainingData, {images: [RED_ONLY, RED_AGAIN]})

        await act(async () => actionBuilder('REPAIR')
            .set(['process.loadedRecipes', PROVIDER, 'model.inputImagery.images'], repaired)
            .dispatch())
        await settled()

        const [{message}] = marked()
        expect(message).toContain(still)
        expect(message).not.toContain(gone)
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

// What a Classification trains on - its own points and those of the recipe it reuses together - must hold what its
// classifier needs, points of two classes for a random forest; what that recipe holds is not known while it is being read,
// or cannot be.
describe('a CLASSIFICATION whose training points are of one class', () => {
    it('says which in its Training data panel and on its button, as unfinished, marking no data set, and holds its Retrieve', async () => {
        await open('CLASSIFICATION', ClassificationTrainingData, {images: [ASSET_IMAGE], consumerPoints: pointsOf(1), reuse: false})

        expect(shown()).toContain(ONE_CLASS_A)
        expect(toolbarProblems().trainingData).toBe(ONE_CLASS_A)
        expect(incompleteSections()).toEqual({trainingData: true})
        expect(marked()).toEqual([])
        expect(retrieveGate()).toMatchObject({code: 'CONFIGURATION_UNMET', section: 'process.classification.panel.trainingData.button'})
    })

    it('can be retrieved where the recipe it reuses stores points of another class', async () => {
        await open('CLASSIFICATION', ClassificationTrainingData, {images: [ASSET_IMAGE], consumerPoints: pointsOf(1), providerPoints: pointsOf(2)})

        expect(shown()).not.toContain(INSUFFICIENT)
        expect(toolbarProblems()).toEqual({})
        expect(retrieveGate()).toBe(null)
    })

    it.each([
        ['being read', 'pending', 'SOURCE_PENDING'],
        ['unreadable', 'unreadable', 'SOURCE_UNAVAILABLE']
    ])('says nothing its points lack while the recipe it reuses is %s, its Retrieve held for that', async (_case, reading, held) => {
        await open('CLASSIFICATION', ClassificationTrainingData, {images: [ASSET_IMAGE], consumerPoints: pointsOf(1), reading})

        expect(shown()).not.toContain(INSUFFICIENT)
        expect(toolbarProblems()).toEqual({})
        expect(incompleteSections()).toEqual({})
        expect(retrieveGate()).toMatchObject({code: held})
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
// Another, over another asset of red alone.
const RED_AGAIN = {...RED_ONLY, imageId: 'i-2', id: 'users/x/again'}
const MISSING_NIR = 'process.classification.panel.trainingData.missingFeatures {"recipe":"Provider","features":"nir"}'
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]
const INSUFFICIENT = 'process.classification.panel.trainingData.insufficient'
const ONE_CLASS_A = `${INSUFFICIENT}.MINIMUM_CLASSES {"classes":"A","minimum":2}`

// A point of each of these classes.
const pointsOf = (...values) => values.map(value => ({x: value, y: value, class: value, value}))

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
// a point of its own - a Classification keeping the data set its map collects into, empty - unless `consumerPoints` or
// `providerPoints` say what each stores. `reuse` false: the consumer reuses nothing.
const recipesOf = (type, {images, consumerImages, points = true, reuse = true, consumerPoints = points ? POINTS : [], providerPoints = points ? POINTS : []}) => [
    recipeOf(type, CONSUMER, {images: consumerImages, dataSets: [
        ...(consumerPoints.length || type === 'CLASSIFICATION' ? [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: consumerPoints}] : []),
        ...(reuse ? [{dataSetId: 'reused', type: 'RECIPE', name: REUSED, recipe: PROVIDER}] : [])
    ]}),
    recipeOf(type, PROVIDER, {images, dataSets: providerPoints.length ? [{dataSetId: 'collected', type: 'COLLECTED', name: COLLECTED, referenceData: providerPoints}] : []})
]

const shown = () => document.body.textContent

const toolbarProblems = () =>
    sourceProblemsOfState(store.getState(), CONSUMER, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key))

// The sections the toolbar marks as unfinished.
const incompleteSections = () =>
    sectionProblemsOfState(store.getState(), CONSUMER, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key)).incompleteSections

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

// The consumer and the provider, as the session holds them - the provider not yet, where the recipe service is still
// `reading` it, or cannot.
async function open(type, TrainingData, {images, consumerImages, points, reuse, consumerPoints, providerPoints, reading}) {
    const records = recipesOf(type, {images, consumerImages, points, reuse, consumerPoints, providerPoints})
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    stored.reading = reading ? {[PROVIDER]: reading} : {}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.filter(({id}) => !stored.reading[id]).map(record => [record.id, record])),
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
