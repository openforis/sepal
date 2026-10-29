import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

import {NEVER, of} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

// What PyEO Alerts asks of its imagery for the index-drop gate: with the gate on, the baseline index from the
// classification's input - a recipe's own index band, or the spectral bands it is calculated of - and the index in each
// monitoring scene; with it off, neither - only what the classifier itself reads. Orchestration only: the requests are
// recorded and no Earth Engine image is built; its values are baselineGateIndex.test.js's.

const geometry = {type: () => 'Polygon'}
const imageRequests = []
const getCollection$ = mock.fn(() => NEVER)
const calculateIndex = mock.fn(() => ({multiply: () => ({int16: () => ({rename: () => 'baseline-index'})})}))

// A recipe input outputs `recipeBands`.
let recipeBands = []
mock.module('#sepal/ee/imageFactory', {exports: {default: (reference, options) => {
    imageRequests.push({reference, options})
    return {getImage$: () => of({select: () => 'selected'}), getBands$: () => of(recipeBands), getGeometry$: () => of(geometry)}
}}})
mock.module('#sepal/ee/aoi', {exports: {toGeometry$: () => of(geometry)}})
mock.module('#sepal/ee/optical/indexes', {exports: {calculateIndex}})
mock.module('#sepal/ee/recipeRef', {exports: {default: () => ({
    getRecipe$: () => of({getTrainingData$: () => of([]), getImage$: () => of({}), classifyImage: () => ({})})
})}})
const classification = vi => ({model: {inputImagery: {images: [vi]}}})
let classificationInput
mock.module('#sepal/ee/recipe', {exports: {loadRecipe$: () => of(classification(classificationInput))}})
mock.module('#sepal/ee/timeSeries/collection', {exports: {getCollection$}})

const {default: pyeoAlerts} = await import('#sepal/ee/pyeo/pyeoAlerts')

beforeEach(() => {
    imageRequests.length = 0
    getCollection$.mock.resetCalls()
    calculateIndex.mock.resetCalls()
})

describe('a PyEO Alerts with its index-drop gate off', () => {
    it('builds no baseline index and asks monitoring for the classifier\'s bands alone', async () => {
        classificationInput = asset(RADAR_BANDS)

        await request(pyeo({indexGate: undefined}))

        assert.equal(calculateIndex.mock.callCount(), 0)
        assert.ok(!(imageRequests.map(({reference}) => reference)).some(actual => isDeepStrictEqual(actual, classificationInput)))
        assert.deepEqual(bandsRequested(), RADAR_BANDS)
    })

    it('still asks monitoring for an index the classifier itself reads', async () => {
        classificationInput = asset(['red', 'nir', 'ndvi'])

        await request(pyeo({indexGate: undefined}))

        assert.equal(calculateIndex.mock.callCount(), 0)
        assert.deepEqual(bandsRequested(), ['red', 'nir', 'ndvi'])
    })
})

describe('a PyEO Alerts with its index-drop gate on', () => {
    it('builds the baseline index from an asset input and asks monitoring for it beside the classifier\'s bands', async () => {
        classificationInput = asset(['red', 'nir'])

        await request(pyeo({indexGate: {index: 'ndvi', threshold: 0.2}}))

        assert.ok(callsOf(calculateIndex).some(actual => actual.length === 2 && actual[0] != null && isDeepStrictEqual(actual[1], 'ndvi')))
        assert.deepEqual(bandsRequested(), ['red', 'nir', 'ndvi'])
    })

    it('asks a recipe input providing the index for it rather than calculating it', async () => {
        classificationInput = {type: 'RECIPE_REF', id: 'mosaic-1', bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]}
        recipeBands = ['red', 'nir', 'swir2', 'nbr']

        await request(pyeo({indexGate: {index: 'nbr', threshold: 0.2}}))

        assert.equal(calculateIndex.mock.callCount(), 0)
        assert.ok((imageRequests).some(actual => isDeepStrictEqual(actual, {reference: classificationInput, options: {selection: ['nbr']}})))
        assert.deepEqual(bandsRequested(), ['red', 'nir', 'nbr'])
    })

    it('calculates it of the spectral bands a recipe input outputs where it provides no index band, once, outside the scenes', async () => {
        classificationInput = {type: 'RECIPE_REF', id: 'stack-1', bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red']}]}
        recipeBands = ['red', 'nir']

        await request(pyeo({indexGate: {index: 'ndvi', threshold: 0.2}}))

        assert.equal(calculateIndex.mock.callCount(), 1)
        assert.ok(imageRequests.some(actual => isDeepStrictEqual(actual, {reference: classificationInput, options: {selection: ['red', 'nir']}})))
        assert.deepEqual(bandsRequested(), ['red', 'ndvi'])
    })
})

describe('a PyEO Alerts with its index-drop gate off over a recipe input', () => {
    it('reads nothing of the recipe input for an index', async () => {
        classificationInput = {type: 'RECIPE_REF', id: 'stack-1', bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red']}]}
        recipeBands = ['red', 'nir']

        await request(pyeo({indexGate: undefined}))

        assert.equal(calculateIndex.mock.callCount(), 0)
        assert.ok(!imageRequests.some(({reference}) => isDeepStrictEqual(reference, classificationInput)))
    })
})

const RADAR_BANDS = ['VV_mean', 'VH_med']

const asset = included => ({type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{type: 'IMAGE_BANDS', included}]})

const pyeo = pyeoAlertsOptions => pyeoAlerts({model: {
    aoi: {type: 'ASSET', id: 'users/x/boundary'},
    dates: {monitoringStart: '2024-01-01', monitoringEnd: '2025-01-01'},
    sources: {classification: 'classification-1', dataSets: {LANDSAT: ['LANDSAT_9']}, changeFromClasses: [1], changeToClasses: [2]},
    pyeoAlertsOptions
}})

// Subscribed until the monitoring collection is asked for, which never answers.
const request = async recipe => {
    const subscription = recipe.getImage$().subscribe()
    await new Promise(resolve => setTimeout(resolve, 0))
    subscription.unsubscribe()
}

const bandsRequested = () => {
    assert.equal(getCollection$.mock.callCount(), 1)
    return callsOf(getCollection$)[0][0].bands
}
