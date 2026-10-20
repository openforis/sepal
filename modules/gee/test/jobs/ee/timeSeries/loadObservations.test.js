import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// The observations a pixel chart loads. A Time Series' chart reads a band of the collection, not the recipe's count
// image, but it is held to what that image requires, which concerns the collection both build. CCDC and Change Alerts
// chart observations through the same request, and are held to nothing here. Earth Engine, the pixel geometry, the
// collection and recipe reads are substituted; the closure, the declarations and the readiness the request is held
// to are the real ones.

describe('loading the observations of a Time Series pixel', () => {
    it('is refused, building no pixel or collection and evaluating nothing, where the classification\'s classifier the Landsat scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(['VV_mean', 'VH_med'])

        await assert.rejects(load({recipe: classified, bands: ['ndvi']}), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNoChartWork()
    })

    it('answers the observations of the requested collection band once the classification is one the scenes can feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        const result = await load({recipe: classified, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.pixels, [{type: 'POINT', ...LAT_LNG}])
        assert.deepEqual(state.collections, [{recipe: classified, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.selected, ['ndvi'])
    })

    it('fails with the read error, starting no chart work, where the classification cannot be read', async () => {
        await assert.rejects(
            load({recipe: classified, bands: ['ndvi']}),
            error => error.message === `Recipe could not be read: ${CLASSIFICATION}`
        )

        assertNoChartWork()
    })

    it('establishes that the recipe can run without building its count image', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        await load({recipe: classified, bands: ['ndvi']})

        assert.deepEqual(state.recipeImages, [])
    })
})

describe('loading the observations of a pixel for another recipe\'s chart', () => {
    it('answers a CCDC\'s observations as before, describing no output and reading no recipe', async () => {
        const ccdc = {
            id: 'ccdc-1',
            type: 'CCDC',
            model: {
                dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
                options: {corrections: ['SR']}
            }
        }

        const result = await load({recipe: ccdc, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.collections, [{recipe: ccdc, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.recipeImages, [])
        assert.deepEqual(state.recipeReads, [])
    })

    it('answers the observations Change Alerts asks for with a model alone', async () => {
        const request = {model: {
            dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
            options: {corrections: ['SR']}
        }}

        const result = await load({recipe: request, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.collections, [{recipe: request, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.recipeImages, [])
        assert.deepEqual(state.recipeReads, [])
    })
})

const CLASSIFICATION = 'classification-1'
const LAT_LNG = {lat: 1, lng: 2}
const PIXEL = 'pixel-geometry'
const OBSERVATIONS = [[0.5, 1577836800000], [0.7, 1580515200000]]

const classified = {
    id: 'time-series-1',
    type: 'TIME_SERIES',
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        dates: {startDate: '2020-01-01', endDate: '2020-04-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }
}

const classification = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const state = {}

const load = async requestArgs => {
    const {default: loadObservations$} = await import('#gee/jobs/ee/timeSeries/loadObservations')
    return lastValueFrom(loadObservations$({requestArgs: {latLng: LAT_LNG, ...requestArgs}}))
}

const assertNoChartWork = () => {
    assert.deepEqual(state.pixels, [])
    assert.deepEqual(state.collections, [])
    assert.deepEqual(state.evaluations, [])
}

// A collection of two images, whose single chunk answers the observations at the pixel.
const collection = {
    aggregate_array: () => 'image ids',
    filter: () => chunk
}
const chunk = {
    select: band => (state.selected.push(band), chunk),
    map: () => chunk,
    toArray: () => chunk,
    reduceRegion: () => chunk,
    get: () => 'chunk observations'
}

mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Filter: {inList: () => 'in chunk'},
            Image: value => ({int64: () => value}),
            Reducer: {first: () => 'first'},
            getInfo$: value => {
                state.evaluations.push(value)
                return of(value === 'image ids' ? ['image-1', 'image-2'] : OBSERVATIONS)
            }
        }
    }
})
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$: aoi => (state.pixels.push(aoi), of(PIXEL))
    }
})
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: args => (state.collections.push(args), of(collection))
    }
})
mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => {
            state.recipeReads.push(id)
            return state.catalogue[id]
                ? of(state.catalogue[id])
                : throwError(() => new Error(`Recipe could not be read: ${id}`))
        }
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: recipe => (state.recipeImages.push(recipe.id), {
            getImage$: () => of({}),
            getBands$: () => of(['count'])
        })
    }
})

beforeEach(() => {
    Object.assign(state, {catalogue: {}, recipeReads: [], pixels: [], collections: [], evaluations: [], selected: [], recipeImages: []})
})
