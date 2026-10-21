import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// The observations a pixel chart loads. A Time Series' or a CCDC's chart reads a band of the collection, not the recipe's
// image, and is held to what its type declares those observations require - the collection's classifier inputs -
// judged at the clicked point, with nothing of the recipe's image described. A Change Alerts chart reads the collection
// it monitors, judged as that collection is; settings naming no recipe are held to nothing, and refused. Earth Engine, the pixel geometry, the collection and recipe reads are
// substituted; the closure, the declarations and the readiness the request is held to are the real ones.

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

    // The chart observes the collection at the clicked point; the AOI is the recipe's, not the chart's.
    for (const [_case, aoi] of [
        ['a recipe that cannot be read', {type: 'RECIPE', id: 'aoi-recipe'}],
        ['the time series itself', {type: 'RECIPE', id: 'time-series-1'}],
        ['an incomplete reference', {type: 'RECIPE'}]
    ]) {
        it(`charts over an AOI of ${_case}, reading nothing of it`, async () => {
            const recipe = {...classified, model: {...classified.model, aoi, sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}}}

            const result = await load({recipe, bands: ['ndvi']})

            assert.equal(result.features.length, OBSERVATIONS.length)
            assert.deepEqual(state.recipeReads, [])
        })
    }

    it('judges the recipe at the pixel without changing the one submitted, which is what the collection is built from', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])
        const recipe = deepFrozen(structuredClone(classified))

        await load({recipe, bands: ['ndvi']})

        assert.deepEqual(recipe, classified)
        assert.equal(state.collections[0].recipe, recipe)
    })
})

describe('loading the observations of a CCDC pixel', () => {
    it('is refused, starting no chart work, where the classification\'s classifier the Landsat scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(['VV_mean', 'VH_med'])

        await assert.rejects(load({recipe: CCDC, bands: ['ndvi']}), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNoChartWork()
    })

    it('answers its observations once the classification is one the scenes can feed, describing nothing of its segments', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        const result = await load({recipe: CCDC, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.collections, [{recipe: CCDC, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.recipeImages, [])
        assert.deepEqual(state.recipeReads, [CLASSIFICATION])
    })
})

// Change Alerts' chart observes the collection of its own Sources over its calibration and monitoring periods, judged
// as that Time Series collection is (observedCollection): its reference, whose segments the chart plots beside them,
// and a Classification its Sources copied from the reference's producer, are no part of it.
describe('loading the observations of a Change Alerts pixel', () => {
    it('answers them for the collection it monitors, reading neither its reference nor a Classification its Sources copied', async () => {
        const result = await load({recipe: CHANGE_ALERTS, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.collections, [{recipe: OBSERVED, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.recipeReads, [])
        assert.deepEqual(state.recipeImages, [])
    })

    it('answers them whatever its reference\'s own segments would need', async () => {
        const recipe = {...CHANGE_ALERTS, model: {...CHANGE_ALERTS.model, reference: {type: 'RECIPE_REF'}}}

        const result = await load({recipe, bands: ['ndvi']})

        assert.equal(result.features.length, OBSERVATIONS.length)
        assert.deepEqual(state.recipeReads, [])
    })

    it('is refused, starting no chart work, where the collection it monitors cannot run, and answered once repaired', async () => {
        const broken = planetAlerts([{}])

        await assert.rejects(load({recipe: broken, bands: ['blue']}), /change-alerts-1 cannot run: its dependencies are invalid \(MALFORMED_REFERENCE\)$/)
        assertNoChartWork()

        const result = await load({recipe: planetAlerts(['users/x/planet']), bands: ['blue']})

        assert.equal(result.features.length, OBSERVATIONS.length)
    })

    it('is refused, starting no chart work, where it states no complete monitoring period', async () => {
        const recipe = {...CHANGE_ALERTS, model: {...CHANGE_ALERTS.model, date: {monitoringEnd: '2021-01-01'}}}

        await assert.rejects(load({recipe, bands: ['ndvi']}), /states no complete monitoring period/)
        assertNoChartWork()
    })
})

describe('loading the observations of collection settings naming no recipe', () => {
    it('is refused, starting no chart work, as no recipe anything is held to', async () => {
        const request = {model: {
            dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: CLASSIFICATION},
            options: {corrections: ['SR']}
        }}

        await assert.rejects(load({recipe: request, bands: ['ndvi']}), /recipe of a type/)
        assertNoChartWork()
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

// Over an AOI recipe nothing holds: the chart reads only its collection.
const CCDC = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: {type: 'RECIPE', id: 'aoi-recipe'},
        dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }
}

// Monitoring Landsat against a CCDC recipe nothing holds, its Sources still carrying a Classification copied from that
// recipe's producer, which cannot be read either.
const CHANGE_ALERTS = {
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'ccdc-unreadable'},
        date: {monitoringEnd: '2021-01-01', monitoringDuration: 6, monitoringDurationUnit: 'months', calibrationDuration: 24, calibrationDurationUnit: 'months'},
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi', classification: 'classification-unreadable'},
        options: {corrections: ['SR'], harmonics: 2}
    }
}

// What it observes: its Sources, without the copied Classification, over calibration and monitoring.
const OBSERVED = {
    id: 'change-alerts-1',
    type: 'TIME_SERIES',
    model: {
        dates: {startDate: '2018-07-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi'},
        options: {corrections: ['SR'], harmonics: 2}
    }
}

// Monitoring Planet imagery merged from the assets given.
const planetAlerts = assets => ({
    ...CHANGE_ALERTS,
    model: {
        ...CHANGE_ALERTS.model,
        sources: {dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}, assets, band: 'blue'}
    }
})

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

const deepFrozen = value => {
    Object.values(value).forEach(child => child && typeof child === 'object' && deepFrozen(child))
    return Object.freeze(value)
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
