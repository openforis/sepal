import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// That a BAYTS Alerts radar map mode answers for the mosaic it draws rather than for the alert product. The
// mosaic is substituted and answers with bands nothing else could produce, so the case says only that the
// delegate was asked - it copies no band list and reconstructs no recipe.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Launched from a Jest bridge so the witness still runs in the ordinary gee gate.

let assets = {}

const eeImage = source => ({
    source,
    geometry: () => ({source}),
    select: () => eeImage(source),
    clip: () => eeImage(source)
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => of({type: 'Image', ...assets[id]}),
            getInfo$: value => of(value),
            Image: value => (value && typeof value === 'object' ? value : eeImage(value)),
            ImageCollection: id => eeImage(id)
        }
    }
})

const DELEGATE_BANDS = ['a-band-only-the-delegate-reports']

mock.module('#sepal/ee/radar/mosaic', {
    exports: {
        default: () => ({
            getImage$: () => of(eeImage('radar-mosaic')),
            getBands$: () => of(DELEGATE_BANDS),
            getGeometry$: () => of({source: 'radar-mosaic'})
        })
    }
})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

const HISTORICAL_STATS = 'users/x/historical'

const alertsRecipe = {
    id: 'bayts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference: {type: 'ASSET', id: HISTORICAL_STATS},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'year'
        },
        options: {orbits: ['ASCENDING']},
        baytsAlertsOptions: {}
    }
}

beforeEach(() => {
    assets = {[HISTORICAL_STATS]: {type: 'Image'}}
})

describe('the bands a BAYTS Alerts radar map mode reports', () => {
    it('are the mosaic delegate\'s own', async () => {
        const reported = await firstValueFrom(imageFactory(alertsRecipe, {visualizationType: 'first'}).getBands$())

        assert.deepEqual(reported, DELEGATE_BANDS)
    })
})
