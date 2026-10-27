import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// The observations a pixel chart loads. A Time Series' or a CCDC's chart reads a band of the collection, not the recipe's
// image, and is held to what its type declares its observations require - the collection's classifier inputs, and the
// Classification its Sources select trainable, whatever band is asked (type/timeSeries.js, type/ccdc.js) - judged at the
// clicked point, with nothing of the recipe's image described. A band the Classification computes must be one it
// provides, refused after what the configuration needs. A Change Alerts chart reads the collection it monitors,
// judged as that collection is; settings naming no recipe are refused. Earth Engine, its band evidence, the pixel
// geometry, the collection and recipe reads are substituted; the closure, the declarations and the readiness the
// request is held to are the real ones.

// Read as the suites are defined.
const CLASSIFIED = 'probability_1'
// Classifications that cannot be trained, and the finding each is refused for.
const UNTRAINABLE = [
    ['stores no points', () => ({[CLASSIFICATION]: trainable({points: []})}), 'NO_TRAINING_DATA'],
    ['reuses a recipe without input imagery', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: []})}), 'MISSING_ROLE'],
    ['reuses a recipe whose imagery lacks a feature it trains on', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: [RED_ONLY_INPUT]})}), 'MISSING_TRAINING_FEATURES'],
    ['has two input images', () => ({[CLASSIFICATION]: trainable({images: [trainable().model.inputImagery.images[0], {...RED_ONLY_INPUT, imageId: 'i-2'}]})}), 'MULTIPLE_CLASSIFIER_INPUTS']
]

describe('loading the observations of a Time Series pixel', () => {
    it('is refused, building no pixel or collection and evaluating nothing, where the classification\'s classifier the Landsat scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_FEATURES})

        await assert.rejects(load({recipe: classified, bands: ['ndvi']}), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNoChartWork()
    })

    it('answers the observations of the requested collection band once the classification is one the scenes can feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable()

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
        state.catalogue[CLASSIFICATION] = trainable()

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
        state.catalogue[CLASSIFICATION] = trainable()
        const recipe = deepFrozen(structuredClone(classified))

        await load({recipe, bands: ['ndvi']})

        assert.deepEqual(recipe, classified)
        assert.equal(state.collections[0].recipe, recipe)
    })
})

// The Classification a Time Series' Sources select is part of its analysis, so what training it needs refuses the
// request, at the recipe it concerns, before anything is built - for a band it computes, which trains it
// (lib/js/ee/src/timeSeries/collection.js), and for a band of the scenes alike, which would not.
describe('loading a Time Series pixel\'s observations over a Classification that cannot be trained', () => {
    for (const [_case, catalogue, code] of UNTRAINABLE) {
        for (const band of [CLASSIFIED, 'ndvi']) {
            it(`is refused for ${band}, starting no chart work, where the Classification ${_case}`, async () => {
                state.catalogue = catalogue()

                await assert.rejects(load({recipe: classified, bands: [band]}), new RegExp(`time-series-1 cannot run: ${code}$`))

                assertNoChartWork()
            })
        }
    }

    it('answers it once the Classification stores points again, building the collection the request names', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
        await assert.rejects(load({recipe: classified, bands: [CLASSIFIED]}), /NO_TRAINING_DATA$/)

        state.catalogue = {[CLASSIFICATION]: trainable()}
        const result = await load({recipe: classified, bands: [CLASSIFIED]})

        assert.equal(result.features.length, OBSERVATIONS.length)
        assert.deepEqual(state.collections, [{recipe: classified, bands: [CLASSIFIED], geometry: PIXEL}])
    })

    it('fails with what could not be read, as no finding and starting no chart work, where the Classification\'s input cannot be observed', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}
        state.assetBands = {}

        await assert.rejects(load({recipe: classified, bands: [CLASSIFIED]}), /cannot run: what it needs could not be read: Asset unreadable: users\/x\/classification-1$/)

        assertNoChartWork()
    })

    // As building the collection refuses it (collection.js), once the configuration is otherwise sound.
    it('refuses an output its trainable Classification does not provide as a client\'s error, starting no chart work', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: {type: 'SVM', svmType: 'C_SVC'}})}

        await assert.rejects(load({recipe: classified, bands: ['regression']}), error =>
            error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && error.statusCode === 400
            && error.message === `Classification ${CLASSIFICATION} does not provide regression`)

        assertNoChartWork()
    })

    // What the configuration needs comes first: the Classification's training before an output asked of it.
    it('refuses a Classification that cannot be trained before an output it does not provide', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: {type: 'SVM', svmType: 'C_SVC'}})}

        await assert.rejects(load({recipe: classified, bands: ['regression']}), /time-series-1 cannot run: NO_TRAINING_DATA$/)
        assertNoChartWork()
    })

    it('refuses classifier inputs the scenes cannot feed before an output the Classification does not provide', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({included: RADAR_FEATURES, classifier: {type: 'SVM', svmType: 'C_SVC'}})}

        await assert.rejects(load({recipe: classified, bands: ['regression']}), /time-series-1 cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)
    })
})

describe('loading the observations of a CCDC pixel', () => {
    it('answers a band its trainable Classification computes', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}

        const result = await load({recipe: CCDC, bands: [CLASSIFIED]})

        assert.equal(result.features.length, OBSERVATIONS.length)
    })

    it('is refused for a band its Classification computes, starting no chart work, where that Classification stores no points', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(load({recipe: CCDC, bands: [CLASSIFIED]}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNoChartWork()
    })

    for (const breakpointBands of [['ndvi'], ['ndvi', CLASSIFIED]]) {
        it(`is refused for a band of the scenes too, starting no chart work, where that Classification stores no points, breakpoint bands ${breakpointBands.join(', ')}`, async () => {
            state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
            const recipe = {...CCDC, model: {...CCDC.model, sources: {...CCDC.model.sources, breakpointBands}}}

            await assert.rejects(load({recipe, bands: ['ndvi']}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

            assertNoChartWork()
        })
    }

    it('is refused, starting no chart work, where the classification\'s classifier the Landsat scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_FEATURES})

        await assert.rejects(load({recipe: CCDC, bands: ['ndvi']}), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNoChartWork()
    })

    it('answers its observations once the classification is one the scenes can feed, describing nothing of its segments', async () => {
        state.catalogue[CLASSIFICATION] = trainable()

        const result = await load({recipe: CCDC, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.deepEqual(state.collections, [{recipe: CCDC, bands: ['ndvi'], geometry: PIXEL}])
        assert.deepEqual(state.recipeImages, [])
        assert.deepEqual(state.recipeReads, [CLASSIFICATION])
    })
})

// Change Alerts' chart now resolves reference processing before observing the collection of its own Sources over its calibration and monitoring periods, judged
// as that Time Series collection is (observedCollection): its reference, whose segments the chart plots beside them,
// and a Classification its Sources copied from the reference's producer, are no part of it.
describe('loading the observations of a Change Alerts pixel', () => {
    beforeEach(() => {
        state.catalogue['ccdc-unreadable'] = {...CCDC, id: 'ccdc-unreadable', model: {
            ...CCDC.model, aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']}, options: {corrections: []}
        }}
    })
    it('refuses a missing configured monitoring band even when the request asks for a different available band, then permits repair', async () => {
        const broken = {...CHANGE_ALERTS, model: {...CHANGE_ALERTS.model, sources: {...CHANGE_ALERTS.model.sources, band: 'nbr'}}}
        state.referenceBands = ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
        await assert.rejects(load({recipe: broken, bands: ['ndvi']}), /MONITORED_MEASURE_ABSENT/)
        assertNoChartWork()
        await load({recipe: CHANGE_ALERTS, bands: ['ndvi']})
        assert.equal(state.collections.length, 1)
        assert.deepEqual(state.builtImages, [])
    })

    it('refuses an unobserved configured band before chart work, using effective reference processing', async () => {
        const reference = state.catalogue['ccdc-unreadable']
        state.catalogue['ccdc-unreadable'] = {...reference, model: {...reference.model, options: {corrections: ['SR']}}}
        state.referenceBands = ['cirrus_coefs', 'cirrus_rmse', 'ndvi_coefs', 'ndvi_rmse']
        const broken = {...CHANGE_ALERTS, model: {...CHANGE_ALERTS.model, options: {corrections: []}, sources: {...CHANGE_ALERTS.model.sources, band: 'cirrus'}}}
        await assert.rejects(load({recipe: broken, bands: ['ndvi']}), /MONITORED_MEASURE_UNOBSERVED/)
        assertNoChartWork()
    })

    it('passes on an unavailable band catalogue without inventing a monitoring finding', async () => {
        state.bandFailure = new Error('Reference catalogue temporarily unavailable')
        await assert.rejects(load({recipe: CHANGE_ALERTS, bands: ['ndvi']}), error => error === state.bandFailure && !error.errorCode)
        assertNoChartWork()
    })

    it('reads reference processing and readiness but neither segments nor a stale consumer Classification', async () => {
        const result = await load({recipe: CHANGE_ALERTS, bands: ['ndvi']})

        assert.deepEqual(result, {features: OBSERVATIONS.map(([value, date]) => ({properties: {date: {value: date}, value}}))})
        assert.equal(state.collections.length, 1)
        assert.deepEqual(state.collections[0].recipe.model.sources, OBSERVED.model.sources)
        assert.deepEqual(state.collections[0].recipe.model.dates, OBSERVED.model.dates)
        assert.deepEqual(state.collections[0].recipe.model.options.corrections, [])
        assert.deepEqual(CHANGE_ALERTS.model.options.corrections, ['SR'])
        // Facts and authorization both read the selected producer; the job's real request scope shares the record.
        assert.deepEqual([...new Set(state.recipeReads)], ['ccdc-unreadable'])
        assert.deepEqual(state.recipeImages, ['ccdc-unreadable']) // Catalogue only; no getImage or segments.
        assert.deepEqual(state.builtImages, [])
    })

    it('refuses a confirmed problem in the referenced CCDC before chart work, and recovers after repair', async () => {
        const reference = state.catalogue['ccdc-unreadable']
        state.catalogue['ccdc-unreadable'] = {...reference, model: {...reference.model, sources: {...reference.model.sources, classification: CLASSIFICATION}}}
        state.catalogue[CLASSIFICATION] = trainable({images: [trainable().model.inputImagery.images[0], {...RED_ONLY_INPUT, imageId: 'i-2'}]})
        await assert.rejects(load({recipe: CHANGE_ALERTS, bands: ['ndvi']}), /cannot run: MULTIPLE_CLASSIFIER_INPUTS$/)
        assertNoChartWork()
        state.catalogue[CLASSIFICATION] = trainable()
        const result = await load({recipe: CHANGE_ALERTS, bands: ['ndvi']})
        assert.equal(result.features.length, OBSERVATIONS.length)
        assert.deepEqual(state.builtImages, [])
    })

    it('holds observations when its required reference cannot be read, without fabricating a finding', async () => {
        delete state.catalogue['ccdc-unreadable']
        await assert.rejects(load({recipe: CHANGE_ALERTS, bands: ['ndvi']}), /Recipe could not be read: ccdc-unreadable/)
        assertNoChartWork()
    })

    it('reads asset processing without its private producer and refuses malformed governing metadata', async () => {
        const recipe = {...CHANGE_ALERTS, model: {...CHANGE_ALERTS.model, reference: {type: 'ASSET', id: 'segments'}}}
        state.properties = {recipe_options: JSON.stringify({corrections: []}), recipe_id: 'private-producer', dateFormat: 1}
        await load({recipe, bands: ['ndvi']})
        assert.deepEqual(state.recipeReads, [])
        assert.deepEqual(state.collections[0].recipe.model.options.corrections, [])
        state.collections = []
        state.pixels = []
        state.evaluations = []
        state.properties.processing = '{broken'
        await assert.rejects(load({recipe, bands: ['ndvi']}), /processing settings cannot be read/)
        assertNoChartWork()
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

// The GUI's charts watch the same (timeSeries/panels/chartPixel.jsx, ccdc/panels/chartPixel.jsx): one operation,
// whatever band is asked.
describe('the operations an observation request is judged by', () => {
    for (const [type, recipeOf] of [['Time Series', () => classified], ['CCDC', () => CCDC]]) {
        for (const band of ['ndvi', CLASSIFIED]) {
            it(`are a ${type}'s observations alone for ${band}`, async () => {
                state.catalogue = {[CLASSIFICATION]: trainable()}

                await load({recipe: recipeOf(), bands: [band]})

                assert.deepEqual(state.judged, ['PIXEL_OBSERVATIONS'])
            })
        }
    }
})

// Selecting none, or a supplied decision tree, needs no training: nothing is observed for it.
describe('loading a pixel\'s observations needing no training', () => {
    for (const [type, recipeOf] of [['Time Series', () => classified], ['CCDC', () => CCDC]]) {
        it(`answers a ${type}'s selecting no Classification, reading none`, async () => {
            const recipe = recipeOf()
            const {classification: _classification, ...sources} = recipe.model.sources

            const result = await load({recipe: {...recipe, model: {...recipe.model, sources}}, bands: ['ndvi']})

            assert.equal(result.features.length, OBSERVATIONS.length)
            assert.deepEqual(state.recipeReads, [])
            assert.deepEqual(state.observed, [])
        })

        it(`answers a ${type}'s over a supplied decision tree storing no points`, async () => {
            state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}})}

            const result = await load({recipe: recipeOf(), bands: ['ndvi']})

            assert.equal(result.features.length, OBSERVATIONS.length)
        })
    }
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

const PROVIDER = 'provider-1'
const TRAINABLE_FEATURES = ['red', 'nir', 'ndvi']
const RED_ONLY_ASSET = 'users/x/red-only'
// An input over imagery holding red alone.
const RED_ONLY_INPUT = {imageId: 'i-1', type: 'ASSET', id: RED_ONLY_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red']}]}
const RADAR_FEATURES = ['VV_mean', 'VH_med']
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it
// reuses; each asset observed holding the trainable features unless the test says otherwise.
const trainable = ({id = CLASSIFICATION, included = TRAINABLE_FEATURES, images, points = POINTS, reuses = [], classifier = {type: 'RANDOM_FOREST'}} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier,
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
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
mock.module('#sepal/ee/asset', {exports: {assetProperties$: () => of(state.properties || {})}})
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
mock.module('#sepal/ee/bandEvidence', {
    exports: {
        assetBandEvidence$: id => {
            state.observed.push(id)
            const bands = state.assetBands[id]
            return bands
                ? of(bands.map(name => ({name, arrayDimensions: 0})))
                : throwError(() => new Error(`Asset unreadable: ${id}`))
        },
        imageBandEvidence$: recipe => throwError(() => new Error(`Image described: ${recipe.id}`))
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: recipe => recipe.type === 'RECIPE_REF' ? recipeRef(recipe) : (state.recipeImages.push(recipe.id), {
            getImage$: () => (state.builtImages.push(recipe.id), of({})),
            getBands$: () => state.bandFailure ? throwError(() => state.bandFailure) : of(state.referenceBands || ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'blue_coefs', 'blue_rmse'])
        })
    }
})

// The real readiness, recording each operation a request is judged by: loaded as a module of its own, which this mock
// does not replace.
const REAL_READINESS = new URL('../../../../src/jobs/executionReadiness.js?recorded', import.meta.url).href
const {requireExecutable$} = await import(REAL_READINESS)
mock.module('#gee/jobs/executionReadiness', {
    exports: {
        requireExecutable$: args => {
            state.judged.push(args.operation)
            return requireExecutable$(args)
        }
    }
})

let recipeRef
beforeEach(async () => {
    recipeRef ||= (await import('#sepal/ee/recipeRef')).default
    Object.assign(state, {
        catalogue: {}, properties: {}, referenceBands: null, bandFailure: null, builtImages: [], recipeReads: [], pixels: [], collections: [], evaluations: [], selected: [], recipeImages: [], observed: [], judged: [],
        assetBands: {[`users/x/${CLASSIFICATION}`]: TRAINABLE_FEATURES, [`users/x/${PROVIDER}`]: TRAINABLE_FEATURES, [RED_ONLY_ASSET]: ['red']}
    })
})
