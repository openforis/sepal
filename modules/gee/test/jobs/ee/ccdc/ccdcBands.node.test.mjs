import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

const catalogue = new Map()

// Optical and radar band discovery is local. Planet Daily is not: which bands it carries depends on the
// imagery that actually contributes, so Earth Engine is substituted at the acquisition boundary by a
// collection that models EE's own filtering - a fake answering with a band list would establish nothing,
// since choosing the wrong imagery is exactly the failure under test.
let assets = {}
let readFailure = null
let assetsRead = []

const QA_BANDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']

// Written as literals: these are the schemas lib/js/ee/src/planet/daily.js branches on, so a production
// rename must not make these cases pass.
const FOUR_BAND_SCHEMA = ['B1', 'B2', 'B3', 'B4', ...QA_BANDS]
const EIGHT_BAND_SCHEMA = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', ...QA_BANDS]

const AOI = {type: 'POLYGON', path: [[0, 0], [0, 10], [10, 10], [10, 0]]}

// What segmentation produces whichever measures it fits; a catalogue holding these alone offers no measure.
const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

const image = ({bands, date = '2020-06-01', longitude = 5}) => ({bands, date, longitude})

const eeNumber = value => ({value, gt: limit => eeNumber(value > limit ? 1 : 0)})

const eeCollection = images => ({
    images,
    filter: matches => eeCollection(images.filter(matches)),
    merge: other => eeCollection([...images, ...other.images]),
    limit: max => eeCollection(images.slice(0, max)),
    size: () => eeNumber(images.length)
})

const propertyOf = (image, property) => {
    switch (property) {
        case 'system:band_names': return image.bands
        case 'system:time_start': return Date.parse(image.date)
        case 'system:time_end': return Date.parse(image.date)
        default: throw new Error(`Unmodelled property: ${property}`)
    }
}

const resolved = value => {
    if (value?.entries) {
        return Object.fromEntries(Object.entries(value.entries).map(([key, entry]) => [key, resolved(entry)]))
    }
    return value?.value
}

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Image: {},
            ImageCollection: source => {
                if (Array.isArray(source)) {
                    return eeCollection(source)
                }
                assetsRead.push(source)
                return eeCollection(assets[source] || [])
            },
            Dictionary: entries => ({entries}),
            Date: date => ({millis: () => Date.parse(date)}),
            Geometry: Object.assign(({geoJson}) => geoJson, {
                Polygon: ({coords}) => ({
                    west: Math.min(...coords[0].map(([longitude]) => longitude)),
                    east: Math.max(...coords[0].map(([longitude]) => longitude))
                })
            }),
            Filter: {
                eq: (property, value) => image =>
                    JSON.stringify(propertyOf(image, property)) === JSON.stringify(value),
                bounds: geometry => image => image.longitude >= geometry.west && image.longitude <= geometry.east,
                gte: (property, millis) => image => propertyOf(image, property) >= millis,
                lte: (property, millis) => image => propertyOf(image, property) <= millis,
                and: (...filters) => image => filters.every(matches => matches(image)),
                or: (...filters) => image => filters.some(matches => matches(image))
            },
            getInfo$: value => readFailure
                ? throwError(() => new Error(readFailure))
                : of(resolved(value))
        }
    }
})

const readRecipe$ = id =>
    catalogue.has(id)
        ? of(catalogue.get(id))
        : throwError(() => new Error(`No such recipe: ${id}`))

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')

// Each case is its own execution operation: one reader, one record per recipe, released at the end.
const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(readRecipe$)
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

beforeEach(() => {
    catalogue.clear()
    assets = {}
    readFailure = null
    assetsRead = []
})

describe('CCDC band discovery', () => {
    inOperation('uses TOA bands for omitted corrections, just as for an explicit empty list', async () => {
        const recipe = ccdc()
        const uncorrected = ccdc({options: {corrections: []}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())
        const uncorrectedBands = await firstValueFrom(imageFactory(uncorrected).getBands$())

        assert.deepEqual(bands, uncorrectedBands)
        assert.ok(bands.includes('cirrus_coefs'))
        assert.ok(bands.includes('ndvi_coefs'))
    })

    inOperation('honors explicit surface-reflectance corrections', async () => {
        const recipe = ccdc({options: {corrections: ['SR', 'BRDF']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('thermal_coefs'))
        assert.ok(bands.includes('ndvi_coefs'))
        assert.ok(!bands.includes('cirrus_coefs'))
        assert.ok(!bands.includes('pan_coefs'))
    })

    inOperation('describes the selected optical sensor', async () => {
        const recipe = ccdc({dataSets: {SENTINEL_2: ['SENTINEL_2']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('redEdge1_coefs'))
        assert.ok(!bands.includes('thermal_coefs'))
    })

    inOperation('keeps radar bands separate from optical bands', async () => {
        const recipe = ccdc({dataSets: {SENTINEL_1: ['SENTINEL_1']}})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('VV_coefs'))
        assert.ok(bands.includes('VH_coefs'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

// Execution merges every configured asset and filters by area and dates before processing what is left
// (lib/js/ee/src/planet/collection.js), so the imagery an asset happens to begin with says nothing about what
// the recipe carries. `redEdge` is the marker: only eight-band PSB.SD imagery produces it.
describe('CCDC band discovery over Planet Daily imagery', () => {
    inOperation('states the eight-band measures when the contributing imagery carries eight bands', async () => {
        assets = {
            [DAILY_ASSET]: [
                image({bands: FOUR_BAND_SCHEMA, date: '2010-06-01'}),
                image({bands: EIGHT_BAND_SCHEMA})
            ]
        }

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.ok(bands.includes('redEdge_coefs'))
        assert.ok(bands.includes('red_coefs'))
    })

    inOperation('states no eight-band measure when the contributing imagery carries four bands', async () => {
        assets = {
            [DAILY_ASSET]: [
                image({bands: EIGHT_BAND_SCHEMA, date: '2010-06-01'}),
                image({bands: FOUR_BAND_SCHEMA})
            ]
        }

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.ok(!bands.includes('redEdge_coefs'))
        assert.ok(bands.includes('red_coefs'))
    })

    // Merging a branch is not a union: four-band imagery beside eight-band imagery still carries four.
    inOperation('states only what every contributing image carries when both schemas contribute', async () => {
        assets = {
            [DAILY_ASSET]: [image({bands: EIGHT_BAND_SCHEMA}), image({bands: FOUR_BAND_SCHEMA})]
        }

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.ok(!bands.includes('redEdge_coefs'))
    })

    inOperation('leaves out imagery the area of interest excludes', async () => {
        assets = {
            [DAILY_ASSET]: [
                image({bands: FOUR_BAND_SCHEMA, longitude: 50}),
                image({bands: EIGHT_BAND_SCHEMA})
            ]
        }

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.ok(bands.includes('redEdge_coefs'))
    })

    inOperation('reads every configured asset, not just the first', async () => {
        assets = {
            [DAILY_ASSET]: [image({bands: EIGHT_BAND_SCHEMA})],
            [SECOND_DAILY_ASSET]: [image({bands: FOUR_BAND_SCHEMA})]
        }

        const bands = await firstValueFrom(
            imageFactory(dailyPlanetCcdc({assets: [DAILY_ASSET, SECOND_DAILY_ASSET]})).getBands$()
        )

        assert.deepEqual(assetsRead, [DAILY_ASSET, SECOND_DAILY_ASSET])
        assert.ok(!bands.includes('redEdge_coefs'))
    })

    // Nothing contributing is not an observed four-band collection: there is no imagery to fit, and offering
    // its measures would offer an export that cannot run.
    inOperation('states no measure at all when the dates leave no imagery', async () => {
        assets = {[DAILY_ASSET]: [image({bands: EIGHT_BAND_SCHEMA, date: '2010-06-01'})]}

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.deepEqual(bands, SEGMENT_BANDS)
    })

    inOperation('states no measure at all when no imagery carries a schema it can process', async () => {
        assets = {[DAILY_ASSET]: [image({bands: ['band_1', 'band_2']})]}

        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$())

        assert.deepEqual(bands, SEGMENT_BANDS)
    })

    inOperation('states no measure at all when no asset is configured', async () => {
        const bands = await firstValueFrom(imageFactory(dailyPlanetCcdc({assets: []})).getBands$())

        assert.deepEqual(assetsRead, [])
        assert.deepEqual(bands, SEGMENT_BANDS)
    })

    // Histogram matching returns the four bands it matches, whatever it was given.
    inOperation('states the matched measures alone when histogram matching is enabled', async () => {
        assets = {[DAILY_ASSET]: [image({bands: EIGHT_BAND_SCHEMA})]}

        const bands = await firstValueFrom(
            imageFactory(dailyPlanetCcdc({options: {histogramMatching: 'ENABLED'}})).getBands$()
        )

        assert.ok(!bands.includes('redEdge_coefs'))
        assert.ok(bands.includes('red_coefs'))
    })

    // A collection that could not be read is unknown, not four-band: a saved catalogue would then be replaced
    // by a narrower one no evidence supports.
    inOperation('propagates a failed read rather than answering with the four every image carries', async () => {
        assets = {[DAILY_ASSET]: [image({bands: EIGHT_BAND_SCHEMA})]}
        readFailure = 'Collection unavailable'

        await assert.rejects(
            firstValueFrom(imageFactory(dailyPlanetCcdc()).getBands$()),
            /Collection unavailable/
        )
    })

    inOperation('reads no imagery at all for a basemap collection', async () => {
        const recipe = dailyPlanetCcdc({dataSets: {PLANET: ['NICFI']}, assets: []})

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.deepEqual(assetsRead, [])
        assert.ok(bands.includes('red_coefs'))
        assert.ok(!bands.includes('redEdge_coefs'))
    })
})

describe('Slice band discovery over a CCDC reference', () => {
    inOperation('resolves optical slice bands when the source omits corrections', async () => {
        const source = ccdc()
        catalogue.set(source.id, source)
        const recipe = sliceOver(source)

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('ndvi'))
        assert.ok(bands.includes('cirrus'))
        assert.ok(bands.includes('ndvi_intercept'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

describe('Masking band discovery over saved recipes', () => {
    inOperation('loads an unopened Slice and its optical CCDC source without corrections', async () => {
        const source = ccdc()
        const slice = sliceOver(source)
        catalogue.set(source.id, source)
        catalogue.set(slice.id, slice)
        const recipe = {
            id: 'masking-1',
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: slice.id}}
        }

        const bands = await firstValueFrom(imageFactory(recipe).getBands$())

        assert.ok(bands.includes('ndvi'))
        assert.ok(bands.includes('cirrus'))
        assert.ok(bands.includes('ndvi_intercept'))
        assert.ok(!bands.includes('ndvi_coefs'))
    })
})

const ccdc = ({dataSets = {LANDSAT: ['LANDSAT_8']}, options = {}} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        sources: {dataSets},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        options,
        ccdcOptions: {dateFormat: 1}
    }
})

const DAILY_ASSET = 'users/x/daily'
const SECOND_DAILY_ASSET = 'users/x/daily-2'

const dailyPlanetCcdc = ({
    dataSets = {PLANET: ['DAILY']},
    assets = [DAILY_ASSET],
    options = {}
} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: AOI,
        sources: {dataSetType: 'PLANET', dataSets, assets, breakpointBands: ['ndvi']},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        options,
        ccdcOptions: {dateFormat: 1}
    }
})

const sliceOver = source => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {
        source: {type: 'RECIPE_REF', id: source.id},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
    }
})
