import {describe, expect, it, vi} from 'vitest'

// A requirement a recipe's output read judges (sourceRequirements.js), through the real registrations of the types
// declaring one and the shared declarations refusing their output: one refusal marks the item and the section it is
// about, holds Retrieve and withdraws previews, wherever the recipe is shown - and once repaired, none of them does.
// What the output read has not established marks and holds nothing of its own. The output of each recipe here is
// described from the session alone: its input is an optical mosaic, described from its configuration.

vi.mock('~/translate', () => ({msg: (key, values) => {
    const name = Array.isArray(key) ? key.join('.') : key
    return values ? `${name} ${JSON.stringify(values)}` : name
}}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// How often the session's output is resolved, counted.
const resolutions = vi.hoisted(() => ({count: 0}))
vi.mock('#sepal/recipe/output/readImageOutput', async importOriginal => {
    const original = await importOriginal()
    return {...original, readImageOutput: (...args) => {
        resolutions.count++
        return original.readImageOutput(...args)
    }}
})

const {addRecipeType, getRecipeType} = await import('../recipeTypeRegistry')
const {default: classification} = await import('./classification/classification')
const {default: regression} = await import('./regression/regression')
const {default: unsupervisedClassification} = await import('./unsupervisedClassification/unsupervisedClassification')
const {inputImageryRequirements} = await import('../panels/inputImageryWithDerived/inputImageryRequirements')
const {retrieveAvailability} = await import('./operationAvailability')
const {readRetrieveOutput} = await import('./retrieveOutput')
const {OutputRegistry} = await import('../sourceRuntime/outputRegistry')
const {compatibleBasis, outputLoading} = await import('./recipeOutput')
const {NEVER, Subject} = await import('rxjs')
const {heldSourceStatusOfState, itemStatusesOfState, sourceProblemsOfState} = await import('./selectedSourceStatus')
const {readOutputRequirementsOfState, requestGate} = await import('./sourceRequirements')
const {IMAGE_OUTPUT} = await import('./recipeOutput')

addRecipeType(classification())
addRecipeType(regression())
addRecipeType(unsupervisedClassification())

describe('the requirement on input band sets', () => {
    it.each(['CLASSIFICATION', 'REGRESSION', 'UNSUPERVISED_CLASSIFICATION'])('is registered by %s', type => {
        expect(getRecipeType(type).sourceRequirements).toEqual(expect.arrayContaining(inputImageryRequirements))
    })
})

describe('a recipe whose output read refuses an input\'s band set', () => {
    it('is marked on that input and its section, and Retrieve and its previews are held, saying which section', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red', 'elevation']), image('image-2', MOSAIC, ['nir'])]))

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(sourceProblems(state).inputImagery).toBe(UNAVAILABLE_SUMMARY)
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET', section: SECTION}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: SECTION})
        expect(heldSourceStatusOfState(state, recipeOf(state), previewGate(state))).toMatchObject({section: SECTION})
        expect(retrieveRead(state).output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: SECTION}])
    })

    it('is said to need another band where a band combination is all that is wrong, and is marked so', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'], [ratio('nir')])]))

        expect(itemProblems(state)).toEqual({'image-1': INCOMPLETE})
        expect(sourceProblems(state).inputImagery).toBe(INCOMPLETE)
        expect(retrieve(state).available).toBe(false)
    })

    it('is said to have unavailable bands where one is, beside an incomplete band combination', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'], [ratio('nir')]), image('image-2', MOSAIC, ['elevation'])]))

        expect(itemProblems(state)).toEqual({'image-1': INCOMPLETE, 'image-2': MISSING})
        expect(sourceProblems(state).inputImagery).toBe(UNAVAILABLE_SUMMARY)
    })

    it('is held by a refusal established beside an input not yet described', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]))

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(retrieve(state).available).toBe(false)
        expect(previewGate(state)).toMatchObject({withdraw: true})
    })

    it('stays marked and held once another input\'s asset is found missing', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]), {
            assets: {[ASSET.id]: {version: null, checkedAt: Date.now(), changedAt: null, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}}
        })

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(sourceProblems(state).inputImagery).toBeDefined()
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET'}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET'})
    })

    it('is read once for every consumer, Retrieve and the runtime\'s watch included, while its records stay as they were', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]))
        const watch = runtimeWatching(state)
        const reads = readOutputRequirementsOfState({state, recipe: recipeOf(state), heldFor})
        retrieveRead(state)
        const resolved = resolutions.count

        const unrelated = unrelatedEditOf(state)
        watch.sessionIs(unrelated)
        itemProblems(unrelated)
        sourceProblems(unrelated)
        retrieve(unrelated)
        previewGate(unrelated)
        retrieveRead(unrelated)

        expect(resolutions.count).toBe(resolved)
        expect(readOutputRequirementsOfState({state: unrelated, recipe: recipeOf(unrelated), heldFor})).toBe(reads)
    })

    it('is read again once a record its output reads changes, and says what that record now establishes', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation'])]))
        const watch = runtimeWatching(state)
        itemProblems(state)
        const resolved = resolutions.count

        const repaired = withRecipe(state, {...recipeOf(state), model: modelOf([image('image-1', MOSAIC, ['red'])])})
        watch.sessionIs(repaired)
        expect(itemProblems(repaired)).toEqual({})
        const reloaded = withRecipe(repaired, {...MOSAIC, model: {...MOSAIC.model, sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100}}})
        itemProblems(reloaded)

        expect(resolutions.count).toBe(resolved + 2)
    })
})

describe('a recipe whose output read refuses nothing', () => {
    it('once repaired, is marked nowhere, and nothing holds its operations for its band sets', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])]))

        expect(itemProblems(state)).toEqual({})
        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toEqual({available: true, gate: null})
        expect(previewGate(state)).toBeNull()
        expect(retrieveRead(state).output.status).toBe('READY')
    })

    it('while an input is not yet described, is marked nowhere, and Retrieve and new previews wait for it', () => {
        const state = sessionWith(modelOf([image('image-1', ASSET, ['elevation'])]))

        expect(itemProblems(state)).toEqual({})
        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toMatchObject({available: false, gate: {wait: true, code: 'SOURCE_PENDING', section: SECTION}})
        expect(previewGate(state)).toMatchObject({wait: true, withdraw: false})
        expect(retrieveRead(state).output.status).toBe('NEEDS_EVIDENCE')
    })

    it('once an input cannot be read, is marked nowhere, and Retrieve is held as unavailable', () => {
        const state = sessionWith(modelOf([image('image-1', ASSET, ['elevation'])]))
        const failed = key => key.kind === 'DESCRIBE'
            ? {status: 'UNAVAILABLE', diagnostics: [], error: new Error('Earth Engine unreachable'), basis: [], assets: [ASSET.id]}
            : null

        expect(itemProblems(state, failed)).toEqual({})
        expect(sourceProblems(state, failed)).toEqual({})
        expect(retrieve(state, failed)).toMatchObject({available: false, gate: {wait: false, code: 'SOURCE_UNAVAILABLE'}})
    })
})

describe('the requirements of a type its output read judges', () => {
    it('are not read without the source runtime\'s answers', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])]))

        expect(() => requestGate({state, recipe: recipeOf(state), operation: IMAGE_OUTPUT, now: Date.now()})).toThrow()
    })
})

const ID = 'classification-1'
const SECTION = 'process.classification.panel.inputImagery.button'
const MISSING = 'process.classification.panel.inputImagery.unavailableSelections.input'
const UNAVAILABLE_SUMMARY = 'process.classification.panel.inputImagery.unavailableSelections.inputs'
const INCOMPLETE = 'process.classification.panel.inputImagery.unavailableSelections.incompleteCombination'

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const ASSET = {id: 'users/x/covariates', type: 'ASSET'}

const image = (imageId, source, included, otherSets = []) => ({
    imageId,
    type: source.type === 'ASSET' ? 'ASSET' : 'RECIPE_REF',
    id: source.id,
    bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', included}, ...otherSets]
})

const ratio = (...included) => ({id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included})

const modelOf = images => ({
    inputImagery: {images},
    legend: {entries: [{id: 'entry-1', value: 1, label: 'Forest', color: '#000000'}]},
    trainingData: {dataSets: []},
    classifier: {type: 'RANDOM_FOREST'}
})

const sessionWith = (model, {assets = {}} = {}) => ({
    process: {
        loadedRecipes: {[ID]: {id: ID, type: 'CLASSIFICATION', model}, [MOSAIC.id]: MOSAIC},
        recipes: [{id: ID, name: 'Land cover'}, {id: MOSAIC.id, name: 'Covariates'}],
        recipeListing: {checkedAt: Date.now()},
        assetEvidence: {generation: 0, assets}
    }
})

const recipeOf = state => state.process.loadedRecipes[ID]

// The session with another recipe edited, the map resized and an output settled elsewhere: nothing this recipe reads.
const unrelatedEditOf = state => ({
    ...state,
    dimensions: {width: 800, height: 600},
    process: {
        ...state.process,
        loadedRecipes: {...state.process.loadedRecipes, 'other-1': {id: 'other-1', type: 'MOSAIC', model: {}}},
        sourceOutputSettlements: (state.process.sourceOutputSettlements || 0) + 1
    }
})

const withRecipe = (state, recipe) => ({
    ...state,
    process: {...state.process, loadedRecipes: {...state.process.loadedRecipes, [recipe.id]: recipe}}
})

// The runtime's output registry watching the recipe's output as its requirements read it, over a session the test
// replaces; the work it starts never settles.
const runtimeWatching = initial => {
    let session = initial
    const changes = new Subject()
    const registry = new OutputRegistry({
        session: () => ({catalogue: session.process.loadedRecipes, credentials: null, closed: false}),
        sessionChanges$: changes,
        acquisitionOf: outputLoading,
        operationOf: () => NEVER,
        isCompatible: compatibleBasis
    })
    registry.watchOutput$({recipeId: ID, product: {name: IMAGE_OUTPUT}, explain: true}).subscribe()
    return {
        sessionIs: state => {
            session = state
            changes.next()
        }
    }
}

// The session answers alone here: the runtime holds nothing.
const heldFor = () => null

const itemProblems = (state, held = heldFor) => Object.fromEntries(Object.entries(itemStatusesOfState(state, ID, 'inputImagery', held))
    .map(([id, {message}]) => [id, message]))

const sourceProblems = (state, held = heldFor) => sourceProblemsOfState(state, ID, () => null, Date.now(), held)

const retrieve = (state, held = heldFor) => retrieveAvailability({state, recipe: recipeOf(state), heldFor: held, now: Date.now()})

const previewGate = state => requestGate({state, recipe: recipeOf(state), operation: IMAGE_OUTPUT, heldFor, now: Date.now()})

const retrieveRead = state => readRetrieveOutput({state, recipeId: ID, heldFor})
