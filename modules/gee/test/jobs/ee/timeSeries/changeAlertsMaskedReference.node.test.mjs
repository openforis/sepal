import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What Change Alerts actually runs when its reference is a Masking recipe over CCDC, exercised through its
// own image operation and the real pixel-chart job, over the REAL imageFactory, recipeRef, masking and ccdc.
// Recipe reads, collection construction and Earth Engine are substituted so the mask and the band selection
// can be observed without running Earth Engine.
//
// The alert algebra itself is Earth Engine's and stays outside this witness; the image operation is run only
// as far as handing that algebra its segments image, which is the wiring under test.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM. This
// file is launched from a Jest bridge so the witness still runs in the ordinary gee gate.

let alertAlgebra = []
let catalogue = {}
let loaded = []
let maskApplications = []
let collectionRequests = []
let selections = []
let assets = {}

// An image is identified by what it came from and what has been applied to it. Selecting and clipping are
// how every source is read and are not what these tests are about, so they leave the identity alone; a mask
// is, so it is recorded on the image that carries it.
const eeImage = (source, masks = []) => ({
    source,
    masks,
    geometry: () => ({source}),
    select: bands => {
        selections.push(bands)
        return eeImage(source, masks)
    },
    clip: () => eeImage(source, masks),
    reduceRegion: () => ({source, masks}),
    bandNames: () => [`${source}:band`],
    updateMask: mask => {
        const maskedImage = eeImage(source, [...masks, mask.source])
        maskApplications.push({source: maskedImage.source, masks: maskedImage.masks})
        return maskedImage
    }
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => of({type: 'Image', properties: {}, ...assets[id]}),
            getInfo$: value => of(value),
            Image: image => (image && typeof image === 'object' ? image : eeImage(image)),
            ImageCollection: id => eeImage(id),
            Geometry: Object.assign(geoJson => geoJson, {Point: coordinates => ({point: coordinates})}),
            Reducer: {first: () => 'first'},
            Algorithms: {TemporalSegmentation: {Ccdc: () => eeImage('segments')}}
        }
    }
})

// Observe which bands each collection is asked for, without constructing EE imagery.
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({recipe, bands}) => {
            collectionRequests.push({type: recipe.type, bands})
            return of(eeImage('collection'))
        }
    }
})

// The job wrapper schedules work onto a worker thread. What the chart's behavior lives in is the worker it
// is given, so the wrapper hands it back instead.
mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})

// The algebra is Earth Engine's and stays outside this witness. What is under test is the call Change
// Alerts makes into it: which image, and which representation it says the dates are in.
mock.module('#sepal/ee/timeSeries/changeAlertsAlgorithm', {
    exports: {
        analyzeChanges: ({segmentsImage, dateFormat}) => {
            alertAlgebra.push({segmentsImage, dateFormat})
            return eeImage('alerts')
        }
    }
})

const readRecipe$ = id => {
    loaded.push(id)
    return catalogue[id]
        ? of(catalogue[id])
        : throwError(() => new Error(`No such recipe: ${id}`))
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

const {default: changeAlerts} = await import('#sepal/ee/timeSeries/changeAlerts')
const {default: loadSegments$} = await import('#gee/jobs/ee/ccdc/loadSegments')

const MASK_ASSET = 'users/x/mask'
const SEGMENTS_ASSET = 'users/x/segments'

// The reference Change Alerts holds after a selection: what it executes, with the producer's description
// beside it.
const MASKED_REFERENCE = {type: 'RECIPE_REF', id: 'masking-1', dateFormat: 1}
const DIRECT_REFERENCE = {type: 'RECIPE_REF', id: 'ccdc-1', dateFormat: 1}

const ccdcRecipe = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: {type: 'ASSET', id: 'users/x/bounds'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['red']},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        options: {},
        ccdcOptions: {dateFormat: 1}
    }
}

// An asset mosaic standing for a segments asset: it carries physical segment bands, so the band a
// consumer names is not one that can be selected on it.
const assetMosaicRecipe = {
    id: 'asset-mosaic-1',
    type: 'ASSET_MOSAIC',
    model: {
        aoi: {type: 'ASSET_BOUNDS'},
        assetDetails: {type: 'Image', assetId: SEGMENTS_ASSET, metadata: {properties: {dateFormat: 2}}}
    }
}

const maskedAssetMosaicRecipe = {
    id: 'masked-asset-mosaic',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: 'asset-mosaic-1'},
        imageMask: {type: 'ASSET', id: MASK_ASSET}
    }
}

const maskingRecipe = {
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'},
        imageMask: {type: 'ASSET', id: MASK_ASSET}
    }
}

// Change Alerts keeps the segment description beside the reference, so a wrapped source still states the
// representation its dates are stored in.
const alertsOver = reference => ({
    type: 'CHANGE_ALERTS',
    model: {
        reference,
        sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: []},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'year',
            calibrationDuration: 2,
            calibrationDurationUnit: 'year'
        },
        changeAlertsOptions: {}
    }
})

// Which recipes execution had to read, in order and with repeats: Change Alerts builds several factories
// from one reference, and within an operation they are all built from one record of it.
const recipesLoaded = () => loaded

// What execution selected on an image, as opposed to the single band Masking picks off its mask.
const bandsSelected = () => selections.filter(bands => Array.isArray(bands))

// The bands the segments producer was asked to fit, as opposed to those of the collection Change Alerts
// builds to monitor against.
const segmentBandsRequested = () =>
    collectionRequests.filter(({type}) => type === 'CCDC').map(({bands}) => bands)

// Change Alerts' own image operation, run up to and including the call into its algorithm.
const alertImage$ = reference =>
    firstValueFrom(changeAlerts(alertsOver(reference)).getImage$())

// What the algorithm was handed, as the identity of the image plus the representation it was told the
// dates are in.
const alertAlgebraCall = () => {
    const {segmentsImage: {source, masks}, dateFormat} = alertAlgebra.at(-1)
    return {segmentsImage: {source, masks}, dateFormat}
}

// The real pixel-chart job, over the reference Change Alerts holds.
const chartSample$ = reference =>
    firstValueFrom(loadSegments$({
        requestArgs: {recipe: reference, latLng: {lat: 1, lng: 2}, bands: ['ndvi']}
    }))

beforeEach(() => {
    catalogue = {
        'ccdc-1': ccdcRecipe,
        'masking-1': maskingRecipe,
        'asset-mosaic-1': assetMosaicRecipe,
        'masked-asset-mosaic': maskedAssetMosaicRecipe
    }
    alertAlgebra = []
    assets = {[SEGMENTS_ASSET]: {properties: {dateFormat: 2}}}
    selections = []
    loaded = []
    maskApplications = []
    collectionRequests = []
})

describe('the image Change Alerts monitors', () => {
    inOperation('is masked when the reference is a Masking recipe', async () => {
        await alertImage$(MASKED_REFERENCE)

        assert.deepEqual(maskApplications, [{source: 'segments', masks: [MASK_ASSET]}])
    })

    inOperation('still has the monitored band selected on the CCDC underneath it', async () => {
        await alertImage$(MASKED_REFERENCE)

        assert.deepEqual(segmentBandsRequested(), [['ndvi', 'red']])
    })

    // What the alerts are clipped to is reached by running the wrapper, not by loading the producer in its
    // place: the masking recipe is what Change Alerts resolves, and the CCDC only what it leads to.
    inOperation('is clipped to what the selected recipe resolves to', async () => {
        const geometry = await firstValueFrom(changeAlerts(alertsOver(MASKED_REFERENCE)).getGeometry$())

        assert.deepEqual(recipesLoaded(), ['masking-1', 'ccdc-1'])
        assert.deepEqual(geometry, {source: 'users/x/bounds'})
    })

    // Geometry, the segments image and the chart are three separate factory constructions over the same
    // reference. One operation reads each recipe once, and the mask still survives into every one of them.
    inOperation('is built from one record of each recipe, however many factories the operation constructs', async () => {
        await firstValueFrom(changeAlerts(alertsOver(MASKED_REFERENCE)).getGeometry$())
        await alertImage$(MASKED_REFERENCE)
        const sampled = await chartSample$(MASKED_REFERENCE)

        assert.deepEqual(recipesLoaded(), ['masking-1', 'ccdc-1'])
        assert.deepEqual(sampled, {source: 'segments', masks: [MASK_ASSET]})
        assert.deepEqual(maskApplications.map(({masks}) => masks), [[MASK_ASSET], [MASK_ASSET]])
    })

    inOperation('is unmasked when the reference is a CCDC recipe', async () => {
        await alertImage$(DIRECT_REFERENCE)

        assert.deepEqual(recipesLoaded(), ['ccdc-1'])
        assert.deepEqual(maskApplications, [])
    })
})

describe('what the alert algorithm is handed', () => {
    inOperation('is the masked image, with the date representation the producer declares', async () => {
        await alertImage$(MASKED_REFERENCE)

        assert.deepEqual(alertAlgebraCall(), {
            segmentsImage: {source: 'segments', masks: [MASK_ASSET]},
            dateFormat: ccdcRecipe.model.ccdcOptions.dateFormat
        })
    })

    // The producer's current declaration, not the copy Change Alerts keeps beside the reference.
    inOperation('is the producer\'s date representation, not the conflicting copy saved beside the reference', async () => {
        catalogue['ccdc-1'] = {...ccdcRecipe, model: {...ccdcRecipe.model, ccdcOptions: {dateFormat: 2}}}

        await alertImage$({type: 'RECIPE_REF', id: 'masking-1', dateFormat: 1})

        assert.equal(alertAlgebraCall().dateFormat, 2)
    })

    inOperation('is resolved through several wrappers', async () => {
        catalogue['outer'] = {
            id: 'outer',
            type: 'MASKING',
            model: {
                imageToMask: {type: 'RECIPE_REF', id: 'masking-1'},
                imageMask: {type: 'ASSET', id: MASK_ASSET}
            }
        }

        await alertImage$({type: 'RECIPE_REF', id: 'outer', dateFormat: 2})

        assert.equal(alertAlgebraCall().dateFormat, ccdcRecipe.model.ccdcOptions.dateFormat)
        assert.deepEqual(alertAlgebraCall().segmentsImage.masks, [MASK_ASSET, MASK_ASSET])
    })

    // An asset-backed producer answers to its physical segment bands, so nothing selects the monitored
    // band on it - not for the image, and not for the geometry and bands resolved on the way.
    inOperation('selects no band at all on an asset-backed producer', async () => {
        await alertImage$({type: 'RECIPE_REF', id: 'masked-asset-mosaic'})

        assert.deepEqual(bandsSelected(), [])
        assert.equal(alertAlgebraCall().dateFormat, 2)
    })

    inOperation('is the unmasked image for a direct CCDC reference', async () => {
        await alertImage$(DIRECT_REFERENCE)

        assert.deepEqual(alertAlgebraCall(), {
            segmentsImage: {source: 'segments', masks: []},
            dateFormat: ccdcRecipe.model.ccdcOptions.dateFormat
        })
    })
})

describe('the image the pixel chart samples', () => {
    inOperation('is masked when the reference is a Masking recipe', async () => {
        const sampled = await chartSample$(MASKED_REFERENCE)

        assert.deepEqual(sampled, {source: 'segments', masks: [MASK_ASSET]})
    })

    inOperation('still has the charted band selected on the CCDC underneath it', async () => {
        await chartSample$(MASKED_REFERENCE)

        assert.deepEqual(segmentBandsRequested(), [['ndvi', 'red']])
    })

    inOperation('is unmasked when the reference is a CCDC recipe', async () => {
        const sampled = await chartSample$(DIRECT_REFERENCE)

        assert.deepEqual(sampled, {source: 'segments', masks: []})
    })
})
