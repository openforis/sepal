import {jest} from '@jest/globals'
import {NEVER, of} from 'rxjs'

// What PyEO Alerts asks of its imagery for the index-drop gate: with the gate on, the baseline index from the
// classification's input and the index in each monitoring scene; with it off, neither - only what the classifier itself
// reads. Orchestration only: the requests are recorded and no Earth Engine image is built.

const geometry = {type: () => 'Polygon'}
const imageRequests = []
const getCollection$ = jest.fn(() => NEVER)
const calculateIndex = jest.fn(() => ({multiply: () => ({int16: () => ({rename: () => 'baseline-index'})})}))

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: (reference, options) => {
    imageRequests.push({reference, options})
    return {getImage$: () => of({select: () => 'selected'}), getGeometry$: () => of(geometry)}
}}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$: () => of(geometry)}))
jest.unstable_mockModule('#sepal/ee/optical/indexes', () => ({calculateIndex}))
jest.unstable_mockModule('#sepal/ee/recipeRef', () => ({default: () => ({
    getRecipe$: () => of({getTrainingData$: () => of([]), getImage$: () => of({}), classifyImage: () => ({})})
})}))
const classification = vi => ({model: {inputImagery: {images: [vi]}}})
let classificationInput
jest.unstable_mockModule('#sepal/ee/recipe', () => ({loadRecipe$: () => of(classification(classificationInput))}))
jest.unstable_mockModule('#sepal/ee/timeSeries/collection', () => ({getCollection$}))

const {default: pyeoAlerts} = await import('#sepal/ee/pyeo/pyeoAlerts')

beforeEach(() => {
    imageRequests.length = 0
    getCollection$.mockClear()
    calculateIndex.mockClear()
})

describe('a PyEO Alerts with its index-drop gate off', () => {
    it('builds no baseline index and asks monitoring for the classifier\'s bands alone', async () => {
        classificationInput = asset(RADAR_BANDS)

        await request(pyeo({indexGate: undefined}))

        expect(calculateIndex).not.toHaveBeenCalled()
        expect(imageRequests.map(({reference}) => reference)).not.toContainEqual(classificationInput)
        expect(bandsRequested()).toEqual(RADAR_BANDS)
    })

    it('still asks monitoring for an index the classifier itself reads', async () => {
        classificationInput = asset(['red', 'nir', 'ndvi'])

        await request(pyeo({indexGate: undefined}))

        expect(calculateIndex).not.toHaveBeenCalled()
        expect(bandsRequested()).toEqual(['red', 'nir', 'ndvi'])
    })
})

describe('a PyEO Alerts with its index-drop gate on', () => {
    it('builds the baseline index from an asset input and asks monitoring for it beside the classifier\'s bands', async () => {
        classificationInput = asset(['red', 'nir'])

        await request(pyeo({indexGate: {index: 'ndvi', threshold: 0.2}}))

        expect(calculateIndex).toHaveBeenCalledWith(expect.anything(), 'ndvi')
        expect(bandsRequested()).toEqual(['red', 'nir', 'ndvi'])
    })

    it('asks a recipe input for the index rather than calculating it', async () => {
        classificationInput = {type: 'RECIPE_REF', id: 'mosaic-1', bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]}

        await request(pyeo({indexGate: {index: 'nbr', threshold: 0.2}}))

        expect(calculateIndex).not.toHaveBeenCalled()
        expect(imageRequests).toContainEqual({reference: classificationInput, options: {selection: ['nbr']}})
        expect(bandsRequested()).toEqual(['red', 'nir', 'nbr'])
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
    expect(getCollection$).toHaveBeenCalledTimes(1)
    return getCollection$.mock.calls[0][0].bands
}
