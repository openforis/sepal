import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// What a BAYTS Alerts radar map mode shows: the Radar Mosaic it builds, and how it is masked. The mosaic is
// substituted: it answers with bands nothing else could produce and records the recipe it was built from, and an image
// here is its source and the masks applied to it. Which pixels real imagery holds is the live verifier's
// (verify/baytsAlertsRadarObservation.mjs).
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Launched from a Jest bridge so the witness still runs in the ordinary gee gate.

let assets = {}
let mosaics = []

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
})

describe('the bands a BAYTS Alerts radar map mode reports', () => {
    it('are the mosaic delegate\'s own', async () => {
        const reported = await firstValueFrom(imageFactory(alertsRecipe(), {visualizationType: 'first'}).getBands$())

        assert.deepEqual(reported, DELEGATE_BANDS)
    })
})

describe('the radar mosaic a BAYTS Alerts radar map mode shows', () => {
    for (const [mode, targetDate] of [['first', '2023-12-01'], ['last', '2024-01-01'], ['an unknown mode', '2023-12-01']]) {
        it(`is built for ${mode} around ${targetDate}, over the reference's area, with its radar options and any observation`, async () => {
            await shown(alertsRecipe(), mode === 'an unknown mode' ? 'sideways' : mode)

            assert.deepEqual(mosaics, [{
                type: 'RADAR_MOSAIC',
                model: {
                    aoi: {type: 'GEOMETRY', geometry: {footprint: HISTORICAL_STATS}},
                    dates: {targetDate},
                    options: {...OPTIONS, minObservations: 1}
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
