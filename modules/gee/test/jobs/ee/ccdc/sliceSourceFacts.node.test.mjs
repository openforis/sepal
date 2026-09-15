import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {delay, firstValueFrom, of, throwError} from 'rxjs'

// How a CCDC Slice learns to read the segment dates of the source it slices, exercised through the REAL
// imageFactory, recipeRef, recipe definitions and asset implementations. Recipe reads, collection
// construction, Earth Engine and segment algebra are substituted so input bands and date representation
// can be observed without running Earth Engine.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM. This
// file is launched from a Jest bridge so the witness still runs in the ordinary gee gate.

let catalogue = {}
let recipesRead = []
let assets = {}
// How many reads of an asset fail before it becomes readable. One makes the metadata acquisition fail
// while the image read behind it still works, which is what tells a propagated failure apart from a
// swallowed one that ran on the saved copy instead.
let failingAssetReads = {}
let imageProperties = {}
let interpretations = []
let selections = []
let collectionBands = []

// An image is identified by what it came from and the masks applied to it, so a wrapper's mask is
// visible on the image the slice is built from.
const eeImage = (id, masks = []) => ({
    id,
    masks,
    geometry: () => ({id: `${id}:geometry`}),
    toDictionary: () => imageProperties[id] || {},
    select: bands => {
        selections.push(bands)
        return eeImage(`${id}.selected`, masks)
    },
    clip: () => eeImage(`${id}.clipped`, masks),
    updateMask: mask => eeImage(id, [...masks, mask.id])
})

const eeCollection = id => ({
    id,
    merge: () => eeCollection(id),
    first: () => eeImage(id)
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => {
                if (failingAssetReads[id] > 0) {
                    failingAssetReads[id]--
                    return throwError(() => new Error(`Cannot read asset: ${id}`))
                }
                return of({type: 'Image', properties: {}, ...assets[id]})
            },
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

// Reads answer synchronously unless a case asks otherwise; an asynchronous answer is what separates
// ancestry that is carried from ancestry that merely happens to still be on the stack.
let readsAsync = false

const readRecipe$ = id => {
    recipesRead.push(id)
    const answer$ = catalogue[id]
        ? of(catalogue[id])
        : throwError(() => new Error(`No such recipe: ${id}`))
    return readsAsync ? answer$.pipe(delay(0)) : answer$
}

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

const {default: ccdcSlice} = await import('#sepal/ee/timeSeries/ccdcSlice')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
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

// A wrapper that declares it preserves its primary image's schema and values. Its mask is an edge too,
// and must never be mistaken for the source of the segments.
const masking = (id, imageToMask) => ({
    id,
    type: 'MASKING',
    model: {imageToMask, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

const ccdc = ({id = 'ccdc-1', dateFormat = 0} = {}) => ({
    id,
    type: 'CCDC',
    model: {
        aoi: {type: 'ASSET', id: 'users/x/bounds'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['red']},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        options: {},
        ccdcOptions: {dateFormat}
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

// Which masks the image handed to the segment algebra carries. Masking applies a mask's first band, so
// the selection it made on the way is dropped here - which mask it was is the question.
const masksOnSegments = () =>
    interpretations.at(-1).segmentsImage.masks.map(id => id.replace(/\.selected$/, ''))

// What a use ends up selecting, as opposed to the segment bands every slice reads to build its image.
const bandsSelected = () =>
    selections.filter(bands => Array.isArray(bands) && !bands.includes('tStart'))

const failureOf = async promise => {
    try {
        await promise
        return null
    } catch (error) {
        return error
    }
}

beforeEach(() => {
    catalogue = {}
    recipesRead = []
    assets = {}
    failingAssetReads = {}
    readsAsync = false
    imageProperties = {}
    interpretations = []
    selections = []
    collectionBands = []
})

describe('slicing a CCDC recipe', () => {
    inOperation('requests the base band for a break-confidence preview and uses the source date representation', async () => {
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

    // One record of the source, two factories built from it with different selections: sharing the
    // record must not make two uses of one source share their arguments.
    inOperation('gives each use of one source its own selection, from one record of it', async () => {
        catalogue['ccdc-1'] = {
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
        const recipe = sliceOver({type: 'RECIPE_REF', id: 'ccdc-1'})

        await firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi_breakConfidence']}).getImage$())
        await firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi'], baseBands: ['ndvi']}).getImage$())

        assert.deepEqual(bandsSelected(), [['ndvi_breakConfidence'], ['ndvi']])
        assert.deepEqual(recipesRead, ['ccdc-1'])
    })
})

describe('slicing a wrapper over a producer', () => {
    // The wrapper supplies the pixels, the producer under it supplies the dates.
    inOperation('reads the producer\'s date representation while running the wrapper\'s image', async () => {
        catalogue['ccdc-1'] = ccdc({dateFormat: 2})
        catalogue['masking-1'] = masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'}))

        assert.equal(dateFormatUsed(), 2)
        assert.deepEqual(masksOnSegments(), ['users/x/mask'])
    })

    // Reaching the producer must not leave the outer image being built under the producer's path: the
    // wrapper's own reference to it would then close a cycle that is not there.
    inOperation('builds the wrapper\'s image under its own ancestry when reads answer later', async () => {
        readsAsync = true
        catalogue['ccdc-1'] = ccdc({dateFormat: 2})
        catalogue['masking-1'] = masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'}))

        assert.equal(dateFormatUsed(), 2)
        assert.deepEqual(masksOnSegments(), ['users/x/mask'])
    })

    inOperation('follows the declared preserving input through several wrappers', async () => {
        catalogue['ccdc-1'] = ccdc({dateFormat: 1})
        catalogue['inner'] = masking('inner', {type: 'RECIPE_REF', id: 'ccdc-1'})
        catalogue['outer'] = masking('outer', {type: 'RECIPE_REF', id: 'inner'})

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'outer'}))

        assert.equal(dateFormatUsed(), 1)
    })

    // The producer's current declaration beats the copy an older GUI saved beside the reference.
    inOperation('prefers the producer\'s date representation over the copy saved beside the reference', async () => {
        catalogue['ccdc-1'] = ccdc({dateFormat: 2})
        catalogue['masking-1'] = masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1', dateFormat: 1}))

        assert.equal(dateFormatUsed(), 2)
    })

    // The mask is an edge of the wrapper, but it fills no preserving role.
    inOperation('never takes the wrapper\'s mask for the producer', async () => {
        catalogue['ccdc-1'] = ccdc({dateFormat: 2})
        catalogue['mask-producer'] = ccdc({id: 'mask-producer', dateFormat: 1})
        catalogue['masking-1'] = {
            id: 'masking-1',
            type: 'MASKING',
            model: {
                imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'},
                imageMask: {type: 'RECIPE_REF', id: 'mask-producer'}
            }
        }

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'}))

        assert.equal(dateFormatUsed(), 2)
    })

    // The asset the wrapped mosaic stands for cannot answer to derived base band names.
    inOperation('does not select derived base band names through a wrapper over an asset mosaic', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic()
        catalogue['masking-1'] = masking('masking-1', {type: 'RECIPE_REF', id: 'asset-mosaic-1'})
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'}))

        assert.equal(dateFormatUsed(), 1)
        assert.deepEqual(bandsSelected(), [['ndvi']])
    })

    // One operation, one record of each: discovering the producer and running the image are the same reads.
    inOperation('discovers the producer and runs the image from the same records', async () => {
        catalogue['ccdc-1'] = ccdc({dateFormat: 2})
        catalogue['masking-1'] = masking('masking-1', {type: 'RECIPE_REF', id: 'ccdc-1'})

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'}))

        assert.deepEqual(recipesRead, ['masking-1', 'ccdc-1'])
    })
})

describe('slicing a source that cannot supply segments', () => {
    // A declared preserving role its model does not fill exactly once.
    inOperation('reports a malformed source when the preserving role is unresolved', async () => {
        catalogue['masking-1'] = {id: 'masking-1', type: 'MASKING', model: {}}

        const error = await failureOf(slice$(sliceOver({type: 'RECIPE_REF', id: 'masking-1'})))

        assert.equal(error?.code, 'MALFORMED_SEGMENT_SOURCE')
    })

    // A terminal recipe that declares no segments at all: unsupported, not missing legacy metadata.
    inOperation('reports an unsupported source for a terminal recipe that produces no segments', async () => {
        catalogue['mosaic-1'] = {
            id: 'mosaic-1',
            type: 'MOSAIC',
            model: {
                aoi: {type: 'ASSET', id: 'users/x/bounds'},
                dates: {},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
                compositeOptions: {}
            }
        }

        const error = await failureOf(slice$(sliceOver({type: 'RECIPE_REF', id: 'mosaic-1', dateFormat: 1})))

        assert.equal(error?.code, 'UNSUPPORTED_SEGMENT_SOURCE')
    })

    // A preservation chain that closes on itself is a cycle, reported as one.
    inOperation('reports a cycle in the preservation chain', async () => {
        catalogue['A'] = masking('A', {type: 'RECIPE_REF', id: 'B'})
        catalogue['B'] = masking('B', {type: 'RECIPE_REF', id: 'A'})

        const error = await failureOf(slice$(sliceOver({type: 'RECIPE_REF', id: 'A'})))

        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['A', 'B', 'A'])
    })

    // Run from the root factory, so the slice itself is on the path and the recipe it selected has to
    // stay on it: the cycle closes through the wrapper the slice chose, and is named where it is.
    inOperation('names the selected wrapper on the path a cycle closes on', async () => {
        catalogue['slice-1'] = sliceOver({type: 'RECIPE_REF', id: 'M'})
        catalogue['M'] = {
            id: 'M',
            type: 'MASKING',
            model: {
                imageToMask: {type: 'RECIPE_REF', id: 'C'},
                imageMask: {type: 'RECIPE_REF', id: 'inner'}
            }
        }
        catalogue['inner'] = masking('inner', {type: 'RECIPE_REF', id: 'M'})
        catalogue['C'] = ccdc({id: 'C'})

        const error = await failureOf(
            firstValueFrom(imageFactory({type: 'RECIPE_REF', id: 'slice-1'}).getImage$())
        )

        assert.equal(error?.code, 'CYCLIC_DEPENDENCY')
        assert.deepEqual(error?.recipePath, ['slice-1', 'M', 'inner', 'M'])
    })

    inOperation('reports a malformed source for a selection that is neither a recipe nor an asset', async () => {
        const error = await failureOf(slice$(sliceOver({id: 'users/x/segments'})))

        assert.equal(error?.code, 'MALFORMED_SEGMENT_SOURCE')
    })
})

describe('slicing an asset mosaic over a segments asset', () => {
    inOperation('reads the date representation from the asset itself', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic({savedDateFormat: 9})
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1'}))

        assert.equal(dateFormatUsed(), 1)
    })

    inOperation('falls back to what was saved beside the reference when the asset declares none', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic()
        assets[SEGMENTS_ASSET] = {properties: {}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1', dateFormat: 2}))

        assert.equal(dateFormatUsed(), 2)
    })

    // The base band names a reader derives from a segments asset are not band names on it, which is what
    // the asset mosaic's own definition declares.
    inOperation('does not select derived base band names on it', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic()
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 0}}

        await slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1'}))

        assert.deepEqual(selections, [['ndvi']])
    })

    // A read that failed is a failure. Answering from the copy saved beside the reference would report a
    // date representation nobody confirmed - and the image behind it is readable here, so a slice that
    // fell back would run the algebra rather than fail.
    inOperation('fails rather than falling back to the saved copy when its metadata cannot be read', async () => {
        catalogue['asset-mosaic-1'] = assetMosaic({savedDateFormat: 2})
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}
        failingAssetReads = {[SEGMENTS_ASSET]: 1}

        const error = await failureOf(slice$(sliceOver({type: 'RECIPE_REF', id: 'asset-mosaic-1', dateFormat: 2})))

        assert.match(error?.message ?? '', /Cannot read asset/)
        assert.deepEqual(interpretations, [], 'the segment algebra must not be reached')
    })
})

describe('slicing a segments asset directly', () => {
    inOperation('uses asset metadata when no date representation was configured', async () => {
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 2}}
        const recipe = sliceOver({type: 'ASSET', id: SEGMENTS_ASSET})

        await firstValueFrom(ccdcSlice(recipe, {selection: ['ndvi']}).getImage$())

        assert.equal(dateFormatUsed(), 2)
    })

    inOperation('keeps an explicitly configured zero over the asset metadata', async () => {
        assets[SEGMENTS_ASSET] = {properties: {dateFormat: 1}}

        await slice$(sliceOver({type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 0}))

        assert.equal(dateFormatUsed(), 0)
    })
})

// The GUI describes a collection from its members' properties, overridden by the collection's own. Reading
// only the collection's here would let Preview and the running image disagree about the same asset.
describe('the properties read off a segments asset', () => {
    inOperation('are its own, for an image', async () => {
        assets[SEGMENTS_ASSET] = {type: 'Image', properties: {dateFormat: 1}}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)), {dateFormat: 1})
    })

    inOperation('include those of a collection\'s members', async () => {
        assets[SEGMENTS_ASSET] = {type: 'ImageCollection', properties: {}}
        imageProperties[SEGMENTS_ASSET] = {dateFormat: 1, startDate: '2015-01-01'}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)),
            {dateFormat: 1, startDate: '2015-01-01'})
    })

    inOperation('let a collection\'s own override its members\'', async () => {
        assets[SEGMENTS_ASSET] = {type: 'ImageCollection', properties: {dateFormat: 0}}
        imageProperties[SEGMENTS_ASSET] = {dateFormat: 1}

        assert.deepEqual(await firstValueFrom(assetProperties$(SEGMENTS_ASSET)), {dateFormat: 0})
    })
})
