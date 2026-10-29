import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {delay, lastValueFrom, Observable, of, throwError} from 'rxjs'

// Keep the real factory, recipeRef, retained recipe reads, scope and readiness. In particular there is no
// Promise-wrapped readiness spy: an extra asynchronous hop hides the retained record's completion context.
// Only the external EE/collection boundaries and worker scheduling are substituted.
const state = {collections: [], pixels: [], reads: []}
const LAT_LNG = {lat: 0, lng: 0}
const OBSERVATIONS = [[0.4, 1700000000000]]
const chunk = {select: () => chunk, map: () => chunk, toArray: () => chunk, reduceRegion: () => chunk, get: () => 'observations'}
const collection = {aggregate_array: () => 'ids', filter: () => chunk}

mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})
mock.module('#sepal/ee/ee', {exports: {default: {
    Filter: {inList: () => 'chunk'},
    Image: value => ({int64: () => value}),
    Reducer: {first: () => 'first'},
    getInfo$: value => of(value === 'ids' ? ['scene-1'] : OBSERVATIONS)
}}})
mock.module('#sepal/ee/asset', {exports: {assetProperties$: () => of({})}})
mock.module('#sepal/ee/aoi', {exports: {toGeometry$: aoi => {
    state.pixels.push(aoi)
    return of('pixel')
}}})
mock.module('#sepal/ee/timeSeries/collection', {exports: {getCollection$: args => {
    state.collections.push(args)
    return of(collection)
}}})
mock.module('#sepal/ee/bandEvidence', {exports: {
    assetBandEvidence$: () => of(['VV_med', 'VH_med'].map(name => ({name, arrayDimensions: 0}))),
    imageBandEvidence$: recipe => throwError(() => new Error(`Unexpected image construction: ${recipe.id}`))
}})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {default: loadObservations$} = await import('#gee/jobs/ee/timeSeries/loadObservations')
const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {loadRecipe$} = await import('#sepal/ee/recipe')
const {currentPath, withPath} = await import('#sepal/ee/executionPath')

beforeEach(() => {
    state.collections = []
    state.pixels = []
    state.reads = []
})

const scopeOf = (records, delayed) => new RecipeScope(id => {
    state.reads.push(id)
    const record = records.find(record => record.id === id)
    const answer = record ? of(record) : throwError(() => new Error(`Recipe unreadable: ${id}`))
    return delayed ? answer.pipe(delay(0)) : answer
})

const ccdc = (id, aoi) => ({id, type: 'CCDC', model: {
    aoi, dates: {startDate: '2020-01-01', endDate: '2026-10-22'},
    sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['nbr'], classification: null},
    options: {corrections: []}, ccdcOptions: {dateFormat: 1}
}})
const alerts = id => ({id: 'alerts-1', type: 'CHANGE_ALERTS', model: {
    reference: {type: 'RECIPE_REF', id},
    sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_9']}, band: 'nbr'},
    options: {corrections: []},
    date: {monitoringEnd: '2025-10-22', monitoringDuration: 2, monitoringDurationUnit: 'months', calibrationDuration: 3, calibrationDurationUnit: 'months'}
}})

// Reduced from the supplied CCDC -> Classification AOI -> Stack -> radar asset models. Preserve the
// actual reference roles and the Stack's legacy included-band/alias shape; layers and unrelated settings are omitted.
const CCDC = '016c106c-e7ba-4ae4-90ca-61ebec12819b'
const CLASSIFICATION = '2eff9ce2-b26d-4cd2-95e1-4d15a5f661dc'
const STACK = '4fc06ee9-3827-4def-af55-e4c6fc043b46'
const supplied = [
    ccdc(CCDC, {type: 'RECIPE', id: CLASSIFICATION}),
    {id: CLASSIFICATION, type: 'CLASSIFICATION', model: {
        inputImagery: {images: [{imageId: 'classified-input', type: 'RECIPE_REF', id: STACK,
            bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', included: ['VV', 'VH']}]}]},
        classifier: {type: 'RANDOM_FOREST'}, legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'points', type: 'COLLECTED', referenceData: [{x: 0, y: 0, class: 1}, {x: 1, y: 1, class: 2}]}]}
    }},
    {id: STACK, type: 'STACK', model: {
        inputImagery: {images: [{imageId: 'radar-input', type: 'ASSET', id: 'users/x/radar',
            includedBands: [{id: 'vv', band: 'VV_med'}, {id: 'vh', band: 'VH_med'}]}]},
        bandNames: {bandNames: [{imageId: 'radar-input', bands: [
            {id: 'vv', originalName: 'VV_med', outputName: 'VV'}, {id: 'vh', originalName: 'VH_med', outputName: 'VH'}
        ]}]}
    }}
]

for (const [label, records] of [
    ['a minimal CCDC', [ccdc(CCDC, {type: 'ASSET', id: 'users/x/bounds'})]],
    ['the supplied AOI dependency chain', supplied]
]) {
    describe(`observations over ${label}`, () => {
        for (const delayed of [false, true]) {
            it(`succeeds with ${delayed ? 'delayed' : 'synchronous'} shared recipe reads`, async () => {
                const scope = scopeOf(records, delayed)
                try {
                    const result = await withRecipeScope(scope, () => lastValueFrom(loadObservations$({
                        requestArgs: {recipe: alerts(CCDC), latLng: LAT_LNG, bands: ['nbr']}
                    })))
                    assert.equal(result.features.length, OBSERVATIONS.length)
                    assert.equal(state.collections.length, 1)
                    assert.equal(state.collections[0].recipe.type, 'TIME_SERIES')
                    assert.equal(state.collections[0].recipe.model.sources.classification, undefined)
                    assert.deepEqual(state.pixels, [{type: 'POINT', ...LAT_LNG}])
                    assert.deepEqual(state.reads, records.map(({id}) => id))
                    assert.deepEqual(currentPath(), [])
                } finally {
                    scope.close()
                }
            })
        }
    })
}

describe('genuine cycles through delayed retained reads', () => {
    for (const nested of [false, true]) {
        it(`refuses a ${nested ? 'two-recipe' : 'self'} cycle with its complete ancestry`, async () => {
            const root = {id: 'cycle-a', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: nested ? 'cycle-b' : 'cycle-a'}}}
            const child = {id: 'cycle-b', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: root.id}}}
            const scope = scopeOf([root, child], true)
            try {
                await withRecipeScope(scope, () => assert.rejects(lastValueFrom(imageFactory(root).getBands$()), error => {
                    assert.equal(error.code, 'CYCLIC_DEPENDENCY')
                    assert.deepEqual(error.recipePath, nested ? ['cycle-a', 'cycle-b', 'cycle-a'] : ['cycle-a', 'cycle-a'])
                    return true
                }))
            } finally {
                scope.close()
            }
        })
    }
})

// Exercise all notification kinds, including callbacks driven by completion rather than by the record's next.
describe('subscribers to one retained recipe read', () => {
    for (const fails of [false, true]) {
        it(`preserves each caller's path for ${fails ? 'error' : 'next and complete'}`, async () => {
            const failure = new Error('Read failed')
            const delivered = []
            let reads = 0
            const scope = new RecipeScope(() => new Observable(subscriber => {
                reads++
                const handle = setImmediate(() => {
                    if (fails) subscriber.error(failure)
                    else {
                        subscriber.next({id: 'shared'})
                        subscriber.complete()
                    }
                })
                return () => clearImmediate(handle)
            }))
            const follow = path => withPath([path], () => new Promise((resolve, reject) => loadRecipe$('shared').subscribe({
                next: value => delivered.push({kind: 'next', path: [...currentPath()], value}),
                error: error => {
                    delivered.push({kind: 'error', path: [...currentPath()]})
                    error === failure ? resolve() : reject(error)
                },
                complete: () => {
                    delivered.push({kind: 'complete', path: [...currentPath()]})
                    resolve()
                }
            })))
            try {
                await withRecipeScope(scope, () => Promise.all([follow('first'), follow('second')]))
                assert.equal(reads, 1)
                for (const path of ['first', 'second']) {
                    assert.deepEqual(delivered.filter(entry => entry.path[0] === path).map(({kind}) => kind), fails ? ['error'] : ['next', 'complete'])
                }
                assert.deepEqual(currentPath(), [])
            } finally {
                scope.close()
            }
        })
    }
})
