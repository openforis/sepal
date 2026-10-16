import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// PyEO Alerts over a recipe whose area of interest has never been configured.
//
// An absent AOI means "no restriction" to the shared geometry resolver, so a recipe that reached execution
// without one would run unbounded rather than be told what is missing.

const resolvedGeometry = {type: () => 'Polygon'}

const getRecipe$ = mock.fn()
const loadRecipe$ = mock.fn()
const getCollection$ = mock.fn()

const assetGeometry = {
    getImage$: () => of('asset-image'),
    getBands$: () => of(['asset-band']),
    getGeometry$: () => of(resolvedGeometry)
}

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => assetGeometry
    }
})
mock.module('#sepal/ee/recipeRef', {
    exports: {
        default: () => ({getRecipe$})
    }
})
mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$
    }
})
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$
    }
})

const {default: pyeoAlerts} = await import('#sepal/ee/pyeo/pyeoAlerts')

const AOI = {type: 'ASSET', id: 'users/x/boundary'}

const NO_AOI = {
    message: 'Configure an area of interest for PyEO Alerts.',
    key: 'process.pyeoAlerts.error.noAoi'
}

for (const [state, aoi] of [
    ['is absent', undefined],
    ['is the empty object older recipes were saved with', {}]
]) {
    describe(`an area of interest that ${state}`, () => {
        for (const [operation, operate] of [
            ['the image operation', pyeo => pyeo.getImage$()],
            ['the geometry operation', pyeo => pyeo.getGeometry$()]
        ]) {
            it(
                `is what ${operation} reports, before anything is read or built`,
                async () => {
                    const error = await failureOf(operate(pyeoAlerts(recipe({aoi}))))

                    assert.deepEqual(error.userMessage, NO_AOI)
                    assert.equal(error.statusCode, 400)
                    assert.equal(getRecipe$.mock.callCount(), 0)
                    assert.equal(loadRecipe$.mock.callCount(), 0)
                    assert.equal(getCollection$.mock.callCount(), 0)
                }
            )
        }

        it('does not stop the recipe saying which bands it produces', async () => {
            const bands = await firstValueFrom(pyeoAlerts(recipe({aoi})).getBands$())

            assert.ok(bands.includes('binary_decision_from_to_map'))
        })
    })
}

describe('an area of interest that was configured', () => {
    it('resolves through the shared resolver', async () => {
        const geometry = await firstValueFrom(pyeoAlerts(recipe({aoi: AOI})).getGeometry$())

        assert.equal(geometry, resolvedGeometry)
    })

    it('is still rejected by that resolver when its type is not one it knows', async () => {
        const error = await failureOf(pyeoAlerts(recipe({aoi: {type: 'NOT_A_TYPE'}})).getGeometry$())

        assert.ok(error.message.includes('Unsupported aoi type: NOT_A_TYPE'))
        assert.equal(error.userMessage?.key, undefined)
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
    getRecipe$.mock.resetCalls()
    getRecipe$.mock.mockImplementation(() => undefined)
    loadRecipe$.mock.resetCalls()
    loadRecipe$.mock.mockImplementation(() => undefined)
    getCollection$.mock.resetCalls()
    getCollection$.mock.mockImplementation(() => undefined)
})
