import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// What a BAYTS Alerts radar map mode shows: the Radar Mosaic it builds, and how it is masked - and what the alerts are
// computed with. The mosaic and BAYTS itself are substituted: the mosaic answers with bands nothing else could produce and
// records the recipe it was built from, BAYTS records the arguments it is run with, and an image here is its source and
// the masks applied to it. Which pixels real imagery holds is the live verifier's (verify/baytsAlertsRadarObservation.mjs).

let assets = {}
let mosaics = []
let baytsRuns = []

// Whatever is asked of it, answers itself: the alerts' masking, run over no real image.
const anything = new Proxy(function () {}, {get: (_target, key) => key === 'then' ? undefined : anything, apply: () => anything})

const eeImage = (source, masks = []) => ({
    source,
    masks,
    geometry: () => ({footprint: source}),
    select: () => eeImage(source, masks),
    clip: () => eeImage(source, masks),
    mask: () => ({reduce: () => `valid pixels of ${source}`}),
    updateMask: mask => eeImage(source, [...masks, mask])
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => of({type: 'Image', ...assets[id]}),
            getInfo$: value => of(value),
            Image: value => (value && typeof value === 'object' ? value : eeImage(value)),
            ImageCollection: id => eeImage(id),
            Date: () => anything,
            Reducer: {max: () => 'max'}
        }
    }
})

const DELEGATE_BANDS = ['a-band-only-the-delegate-reports']

mock.module('#sepal/ee/radar/mosaic', {
    exports: {
        default: recipe => {
            mosaics.push(recipe)
            return {
                getImage$: () => of(eeImage('radar-mosaic')),
                getBands$: () => of(DELEGATE_BANDS),
                getGeometry$: () => of({source: 'radar-mosaic'})
            }
        }
    }
})

mock.module('#sepal/ee/bayts/bayts', {
    exports: {
        bayts: args => {
            baytsRuns.push(args)
            return anything
        }
    }
})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

const HISTORICAL_STATS = 'users/x/historical'
const OPTIONS = {orbits: ['ASCENDING'], minObservations: 20, spatialSpeckleFilter: 'LEE'}

// A historical recipe held in memory, over an area already resolved.
const HISTORICAL_RECIPE = {
    type: 'BAYTS_HISTORICAL',
    model: {aoi: {type: 'GEOMETRY', geometry: {footprint: 'historical area'}}, dates: {}, options: {orbits: ['ASCENDING']}}
}

const alertsRecipe = (reference = {type: 'ASSET', id: HISTORICAL_STATS}) => ({
    id: 'bayts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference,
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months'},
        options: OPTIONS,
        baytsAlertsOptions: {}
    }
})

const shown = (recipe, visualizationType) => firstValueFrom(imageFactory(recipe, {visualizationType}).getImage$())

beforeEach(() => {
    assets = {[HISTORICAL_STATS]: {type: 'Image'}}
    mosaics = []
    baytsRuns = []
})

// What monitoring forces, whatever is saved (bayts.js).
const FORCED = {outlierRemoval: 'NONE', multitemporalSpeckleFilter: 'NONE', orbitNumbers: 'ALL', minObservations: 1}

// The processing an asset that records none is monitored with: the alerts' own, as BAYTS runs where they state none.
const UNRECORDED = {
    geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'LEE', kernelSize: 9, sigma: 0.9, strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5], snicSize: 5, snicCompactness: 0.15
}

// The processing a history whose options state none of it executes with (radar/collection.js).
const HISTORY_EXECUTES = {
    geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'NONE', kernelSize: 5, sigma: 0.9, strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5], snicSize: 3, snicCompactness: 0.15
}

const radarOptions = () => mosaics[0].model.options

describe('the bands a BAYTS Alerts radar map mode reports', () => {
    it('are the mosaic delegate\'s own', async () => {
        const reported = await firstValueFrom(imageFactory(alertsRecipe(), {visualizationType: 'first'}).getBands$())

        assert.deepEqual(reported, DELEGATE_BANDS)
    })
})

describe('the radar mosaic a BAYTS Alerts radar map mode shows', () => {
    for (const [mode, targetDate] of [['first', '2023-12-01'], ['last', '2024-01-01'], ['an unknown mode', '2023-12-01']]) {
        it(`is built for ${mode} around ${targetDate}, over the reference's area, with its monitoring options and any observation`, async () => {
            await shown(alertsRecipe(), mode === 'an unknown mode' ? 'sideways' : mode)

            assert.deepEqual(mosaics, [{
                type: 'RADAR_MOSAIC',
                model: {
                    aoi: {type: 'GEOMETRY', geometry: {footprint: HISTORICAL_STATS}},
                    dates: {targetDate},
                    options: {...OPTIONS, ...UNRECORDED, ...FORCED}
                }
            }])
        })
    }

    it('is masked to the pixels a historical asset holds', async () => {
        const image = await shown(alertsRecipe(), 'first')

        assert.deepEqual(image.masks, [`valid pixels of ${HISTORICAL_STATS}`])
    })

    it('is not masked over a historical recipe, only built over its area', async () => {
        const image = await shown(alertsRecipe(HISTORICAL_RECIPE), 'last')

        assert.deepEqual(image.masks, [])
        assert.deepEqual(mosaics[0].model.aoi, {type: 'GEOMETRY', geometry: {footprint: 'historical area'}})
    })
})

describe('the processing a BAYTS Alerts radar map mode is built with', () => {
    it('is the historical recipe\'s, what its options leave out as it executes them, beside the alerts\' own passes', async () => {
        await shown(alertsRecipe(HISTORICAL_RECIPE), 'first')

        assert.deepEqual(radarOptions(), {...OPTIONS, ...HISTORY_EXECUTES, ...FORCED})
    })

    it('is what an asset exported from a BAYTS Historical records, complete', async () => {
        assets[HISTORICAL_STATS] = {type: 'Image', properties: {
            recipe_type: 'BAYTS_HISTORICAL',
            recipe_options: JSON.stringify({geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'REFINED_LEE'})
        }}

        await shown(alertsRecipe(), 'last')

        assert.deepEqual(radarOptions(), {...OPTIONS, ...HISTORY_EXECUTES, geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'REFINED_LEE', ...FORCED})
    })

    it('refuses to build anything where the options an asset records cannot be read', async () => {
        assets[HISTORICAL_STATS] = {type: 'Image', properties: {recipe_type: 'BAYTS_HISTORICAL', recipe_options: '{broken'}}

        await assert.rejects(shown(alertsRecipe(), 'first'), {errorCode: 'UNREADABLE_REFERENCE_PROCESSING'})
        assert.deepEqual(mosaics, [])
    })
})

describe('the alerts of a BAYTS Alerts recipe', () => {
    it('are computed, initial alerts included, with the processing the reference records and the alerts\' own passes', async () => {
        assets[HISTORICAL_STATS] = {type: 'Image', properties: {
            recipe_type: 'BAYTS_HISTORICAL',
            recipe_options: JSON.stringify({geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'REFINED_LEE'})
        }}

        await shown(alertsRecipe(), 'alerts')

        assert.equal(baytsRuns.length, 2)
        baytsRuns.forEach(run => assert.partialDeepStrictEqual(run,
            {...OPTIONS, ...HISTORY_EXECUTES, geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'REFINED_LEE', ...FORCED}))
    })

    it('are not computed where the options an asset records cannot be read', async () => {
        assets[HISTORICAL_STATS] = {type: 'Image', properties: {recipe_type: 'BAYTS_HISTORICAL', recipe_options: '{broken'}}

        await assert.rejects(shown(alertsRecipe(), 'alerts'), {errorCode: 'UNREADABLE_REFERENCE_PROCESSING'})
        assert.deepEqual(baytsRuns, [])
    })
})
