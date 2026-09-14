import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What Change Alerts actually runs when its reference is a Masking recipe over CCDC, exercised through its
// own image operation and the real pixel-chart job, over the REAL imageFactory, recipeRef, masking and ccdc.
// HTTP, collection construction and Earth Engine are substituted so the mask and the band selection can be
// observed without running Earth Engine.
//
// The alert algebra itself is Earth Engine's and stays outside this witness; the image operation is run only
// as far as handing that algebra its segments image, which is the wiring under test.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM. This
// file is launched from a Jest bridge so the witness still runs in the ordinary gee gate.

// Thrown by the substituted monitoring collection, which is the last thing Change Alerts asks for before it
// enters the alert algebra. That algebra is Earth Engine's and is not substituted here, so the image
// operation is stopped at exactly that point rather than being allowed to fail wherever it happens to.
class StopBeforeAlertAlgebra extends Error {}

let catalogue = {}
let loaded = []
let maskApplications = []
let collectionRequests = []

mock.module('#sepal/context', {
    exports: {
        context: () => ({sepalEndpoint: 'http://test', sepalUsername: 'test', sepalPassword: 'test'}),
        configure: () => {}
    }
})

mock.module('#sepal/httpClient', {
    exports: {
        get$: url => {
            const id = url.split('/').pop()
            loaded.push(id)
            const recipe = catalogue[id]
            return recipe
                ? of({body: recipe})
                : throwError(() => new Error(`No such recipe: ${id}`))
        }
    }
})

// An image is identified by what it came from and what has been applied to it. Selecting and clipping are
// how every source is read and are not what these tests are about, so they leave the identity alone; a mask
// is, so it is recorded on the image that carries it.
const eeImage = (source, masks = []) => ({
    source,
    masks,
    geometry: () => ({source}),
    select: () => eeImage(source, masks),
    clip: () => eeImage(source, masks),
    reduceRegion: () => ({source, masks}),
    updateMask: mask => {
        const maskedImage = eeImage(source, [...masks, mask.source])
        maskApplications.push({source: maskedImage.source, masks: maskedImage.masks})
        return maskedImage
    }
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: () => of({type: 'Image', properties: {}}),
            getInfo$: value => of(value),
            Image: image => (image && typeof image === 'object' ? image : eeImage(image)),
            ImageCollection: id => eeImage(id),
            Geometry: Object.assign(geoJson => geoJson, {Point: coordinates => ({point: coordinates})}),
            Reducer: {first: () => 'first'},
            Algorithms: {TemporalSegmentation: {Ccdc: () => eeImage('segments')}}
        }
    }
})

// Observe which bands each collection is asked for, without constructing EE imagery. Change Alerts builds
// one of its own to monitor against, after the segments image has resolved; that request is where the image
// operation stops.
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({recipe, bands}) => {
            collectionRequests.push({type: recipe.type, bands})
            return recipe.type
                ? of(eeImage('collection'))
                : throwError(() => new StopBeforeAlertAlgebra())
        }
    }
})

// The job wrapper schedules work onto a worker thread. What the chart's behavior lives in is the worker it
// is given, so the wrapper hands it back instead.
mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})

const {default: changeAlerts} = await import('#sepal/ee/timeSeries/changeAlerts')
const {default: loadSegments$} = await import('#gee/jobs/ee/ccdc/loadSegments')

const MASK_ASSET = 'users/x/mask'

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

// Which recipes execution had to read. Change Alerts resolves its reference more than once per operation,
// so the identities are what this says something about, never how many times each was asked for.
const recipesLoaded = () => [...new Set(loaded)]

// The bands the segments producer was asked to fit, as opposed to those of the collection Change Alerts
// builds to monitor against.
const segmentBandsRequested = () =>
    collectionRequests.filter(({type}) => type === 'CCDC').map(({bands}) => bands)

// Change Alerts' own image operation, run as far as the alert algebra and no further. Reaching that point is
// part of the assertion: any other failure, and any completion without it, is reported rather than accepted.
const alertImageUpToTheAlgebra = reference =>
    assert.rejects(
        firstValueFrom(changeAlerts(alertsOver(reference)).getImage$()),
        error => error instanceof StopBeforeAlertAlgebra
    )

// The real pixel-chart job, over the reference Change Alerts holds.
const chartSample$ = reference =>
    firstValueFrom(loadSegments$({
        requestArgs: {recipe: reference, latLng: {lat: 1, lng: 2}, bands: ['ndvi']}
    }))

beforeEach(() => {
    catalogue = {'ccdc-1': ccdcRecipe, 'masking-1': maskingRecipe}
    loaded = []
    maskApplications = []
    collectionRequests = []
})

describe('the image Change Alerts monitors', () => {
    it('is masked when the reference is a Masking recipe', async () => {
        await alertImageUpToTheAlgebra(MASKED_REFERENCE)

        assert.deepEqual(maskApplications, [{source: 'segments', masks: [MASK_ASSET]}])
    })

    it('still has the monitored band selected on the CCDC underneath it', async () => {
        await alertImageUpToTheAlgebra(MASKED_REFERENCE)

        assert.deepEqual(segmentBandsRequested(), [['ndvi', 'red']])
    })

    // What the alerts are clipped to is reached by running the wrapper, not by loading the producer in its
    // place: the masking recipe is what Change Alerts resolves, and the CCDC only what it leads to.
    it('is clipped to what the selected recipe resolves to', async () => {
        const geometry = await firstValueFrom(changeAlerts(alertsOver(MASKED_REFERENCE)).getGeometry$())

        assert.deepEqual(recipesLoaded(), ['masking-1', 'ccdc-1'])
        assert.deepEqual(geometry, {source: 'users/x/bounds'})
    })

    it('is unmasked when the reference is a CCDC recipe', async () => {
        await alertImageUpToTheAlgebra(DIRECT_REFERENCE)

        assert.deepEqual(recipesLoaded(), ['ccdc-1'])
        assert.deepEqual(maskApplications, [])
    })
})

describe('the image the pixel chart samples', () => {
    it('is masked when the reference is a Masking recipe', async () => {
        const sampled = await chartSample$(MASKED_REFERENCE)

        assert.deepEqual(sampled, {source: 'segments', masks: [MASK_ASSET]})
    })

    it('still has the charted band selected on the CCDC underneath it', async () => {
        await chartSample$(MASKED_REFERENCE)

        assert.deepEqual(segmentBandsRequested(), [['ndvi', 'red']])
    })

    it('is unmasked when the reference is a CCDC recipe', async () => {
        const sampled = await chartSample$(DIRECT_REFERENCE)

        assert.deepEqual(sampled, {source: 'segments', masks: []})
    })
})
