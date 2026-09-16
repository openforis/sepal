import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// PyEO Alerts over a recipe whose area of interest has never been configured.
//
// An absent AOI means "no restriction" to the shared geometry resolver, so a recipe that reached execution
// without one would run unbounded rather than be told what is missing.

const resolvedGeometry = {type: () => 'Polygon'}

const getRecipe$ = jest.fn()
const loadRecipe$ = jest.fn()
const getCollection$ = jest.fn()

const assetGeometry = {
    getImage$: () => of('asset-image'),
    getBands$: () => of(['asset-band']),
    getGeometry$: () => of(resolvedGeometry)
}

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: () => assetGeometry}))
jest.unstable_mockModule('#sepal/ee/recipeRef', () => ({default: () => ({getRecipe$})}))
jest.unstable_mockModule('#sepal/ee/recipe', () => ({loadRecipe$}))
jest.unstable_mockModule('#sepal/ee/timeSeries/collection', () => ({getCollection$}))

const {default: pyeoAlerts} = await import('#sepal/ee/pyeo/pyeoAlerts')

const AOI = {type: 'ASSET', id: 'users/x/boundary'}

const NO_AOI = {
    message: 'Configure an area of interest for PyEO Alerts.',
    key: 'process.pyeoAlerts.error.noAoi'
}

describe.each([
    ['is absent', undefined],
    ['is the empty object older recipes were saved with', {}]
])('an area of interest that %s', (_state, aoi) => {
    it.each([
        ['the image operation', pyeo => pyeo.getImage$()],
        ['the geometry operation', pyeo => pyeo.getGeometry$()]
    ])('is what %s reports, before anything is read or built', async (_operation, operate) => {
        const error = await failureOf(operate(pyeoAlerts(recipe({aoi}))))

        expect(error.userMessage).toEqual(NO_AOI)
        expect(error.statusCode).toBe(400)
        expect(getRecipe$).not.toHaveBeenCalled()
        expect(loadRecipe$).not.toHaveBeenCalled()
        expect(getCollection$).not.toHaveBeenCalled()
    })

    it('does not stop the recipe saying which bands it produces', async () => {
        const bands = await firstValueFrom(pyeoAlerts(recipe({aoi})).getBands$())

        expect(bands).toContain('binary_decision_from_to_map')
    })
})

describe('an area of interest that was configured', () => {
    it('resolves through the shared resolver', async () => {
        const geometry = await firstValueFrom(pyeoAlerts(recipe({aoi: AOI})).getGeometry$())

        expect(geometry).toBe(resolvedGeometry)
    })

    it('is still rejected by that resolver when its type is not one it knows', async () => {
        const error = await failureOf(pyeoAlerts(recipe({aoi: {type: 'NOT_A_TYPE'}})).getGeometry$())

        expect(error.message).toContain('Unsupported aoi type: NOT_A_TYPE')
        expect(error.userMessage?.key).toBeUndefined()
    })
})

// Everything but the area of interest is configured, so nothing else can account for a refusal.
const recipe = ({aoi}) => ({
    type: 'PYEO_ALERTS',
    model: {
        ...(aoi === undefined ? {} : {aoi}),
        sources: {
            classification: 'classification-1',
            dataSets: {LANDSAT: ['LANDSAT_8']},
            cloudPercentageThreshold: 75,
            changeFromClasses: [1],
            changeToClasses: [2]
        },
        options: {corrections: ['SR']},
        dates: {
            baselineStart: '2021-01-01',
            baselineEnd: '2022-01-01',
            monitoringStart: '2022-01-01',
            monitoringEnd: '2023-01-01'
        },
        pyeoAlertsOptions: {minConsecutiveDetections: 2, indexGate: {index: 'ndvi', threshold: 0.2}}
    }
})

const failureOf = stream$ => firstValueFrom(stream$).then(
    value => {
        throw new Error(`Expected a failure, got ${JSON.stringify(value)}`)
    },
    error => error
)

beforeEach(() => {
    getRecipe$.mockReset()
    loadRecipe$.mockReset()
    getCollection$.mockReset()
})
