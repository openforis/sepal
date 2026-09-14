import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// How a CCDC Slice learns to read the segment dates of the source it slices, exercised through the REAL
// imageFactory, recipeRef, recipe definitions and asset implementations. Recipe reads, collection
// construction, Earth Engine and segment algebra are substituted so input bands and date representation
// can be observed without running Earth Engine.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM. This
// file is launched from a Jest bridge so the witness still runs in the ordinary gee gate.

let catalogue = {}
let assets = {}
let imageProperties = {}
let interpretations = []
let selections = []
let collectionBands = []

const eeImage = id => ({
    id,
    geometry: () => ({id: `${id}:geometry`}),
    toDictionary: () => imageProperties[id] || {},
    select: bands => {
        selections.push(bands)
        return eeImage(`${id}.selected`)
    },
    clip: () => eeImage(`${id}.clipped`)
})

const eeCollection = id => ({
    id,
    merge: () => eeCollection(id),
    first: () => eeImage(id)
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => of({type: 'Image', properties: {}, ...assets[id]}),
            getInfo$: value => of(value),
            Image: image => (image && typeof image === 'object' ? image : eeImage(image)),
            ImageCollection: id => eeCollection(id),
            Algorithms: {TemporalSegmentation: {Ccdc: () => eeImage('segments')}}
        }
    }
})

// Observe which source bands CCDC asks its collection to provide, without constructing EE imagery.
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({bands}) => {
            collectionBands.push(bands)
            return of({})
        }
    }
})

// The segment algebra is Earth Engine's. The only thing under test is what it is told the dates mean.
mock.module('#sepal/ee/timeSeries/temporalSegmentation', {
    exports: {
        Segments: (segmentsImage, dateFormat) => {
            interpretations.push({segmentsImage, dateFormat})
            return {interpolate: () => eeImage('interpolated')}
        }
    }
})

const {configureRecipeReader} = await import('#sepal/ee/recipe')

configureRecipeReader(id =>
    catalogue[id]
        ? of(catalogue[id])
        : throwError(() => new Error(`No such recipe: ${id}`))
)

const {default: ccdcSlice} = await import('#sepal/ee/timeSeries/ccdcSlice')
const {assetProperties$} = await import('#sepal/ee/asset')

const SEGMENTS_ASSET = 'users/x/segments'

const sliceOver = source => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {
        source,
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
    }
})

const assetMosaic = ({savedDateFormat} = {}) => ({
    id: 'asset-mosaic-1',
    type: 'ASSET_MOSAIC',
    model: {
        aoi: {type: 'ASSET_BOUNDS'},
        assetDetails: {
            type: 'Image',
            assetId: SEGMENTS_ASSET,
            metadata: {properties: {dateFormat: savedDateFormat}}
        }
    }
})

const slice$ = recipe =>
    firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi'], baseBands: ['ndvi']}).getImage$())

const dateFormatUsed = () => interpretations.at(-1).dateFormat

beforeEach(() => {
    catalogue = {}
    assets = {}
    imageProperties = {}
    interpretations = []
    selections = []
    collectionBands = []
})

describe('slicing a CCDC recipe', () => {
    it('requests the base band for a break-confidence preview and uses the source date representation', async () => {
        const source = {
            id: 'ccdc-1',
            type: 'CCDC',
            model: {
                aoi: {type: 'ASSET', id: 'users/x/bounds'},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['red']},
                dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
                options: {},
                ccdcOptions: {dateFormat: 0}
            }
        }
        catalogue[source.id] = source
        const recipe = sliceOver({type: 'RECIPE_REF', id: source.id, dateFormat: 2})

        await firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi_breakConfidence']}).getImage$())

        assert.deepEqual(collectionBands, [['ndvi', 'red']])
        assert.equal(dateFormatUsed(), source.model.ccdcOptions.dateFormat)
    })
})

describe('slicing an asset mosaic over a segments asset', () => {
    it('reads the date representation from the asset itself', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic({savedDateFormat: 9})
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1'}))

        assert.equal(dateFormatUsed(), 1)
    })

    it('falls back to what was saved beside the reference when the asset declares none', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic()
        assets[SEGMENTS_ASSET] = {properties: {}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1', dateFormat: 2}))

        assert.equal(dateFormatUsed(), 2)
    })

    // The base band names a reader derives from a segments asset are not band names on it, which is what
    // the asset mosaic's own definition declares.
    it('does not select derived base band names on it', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic()
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 0}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1'}))

        assert.deepEqual(selections, [['ndvi']])
    })
})

describe('slicing a segments asset directly', () => {
    it('uses asset metadata when no date representation was configured', async () => {
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 2}}
        const recipe = sliceOver({type: 'ASSET', id: SEGMENTS_ASSET})

        await firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi']}).getImage$())

        assert.equal(dateFormatUsed(), 2)
    })

    it('keeps an explicitly configured zero over the asset metadata', async () => {
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}

        await slice$(sliceOver({type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 0}))

        assert.equal(dateFormatUsed(), 0)
    })
})

// The GUI describes a collection from its members' properties, overridden by the collection's own. Reading
// only the collection's here would let Preview and the running image disagree about the same asset.
describe('the properties read off a segments asset', () => {
    it('are its own, for an image', async () => {
        assets[SEGMENTS_ASSET] = {type: 'Image', properties: {dateFormat: 1}}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)), {dateFormat: 1})
    })

    it('include those of a collection\'s members', async () => {
        assets[SEGMENTS_ASSET] = {type: 'ImageCollection', properties: {}}
        imageProperties[SEGMENTS_ASSET] = {dateFormat: 1, startDate: '2015-01-01'}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)),
            {dateFormat: 1, startDate: '2015-01-01'})
    })

    it('let a collection\'s own override its members\'', async () => {
        assets[SEGMENTS_ASSET] = {type: 'ImageCollection', properties: {dateFormat: 0}}
        imageProperties[SEGMENTS_ASSET] = {dateFormat: 1}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)), {dateFormat: 0})
    })
})
