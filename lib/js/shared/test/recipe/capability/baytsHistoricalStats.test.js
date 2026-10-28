import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {BAYTS_HISTORICAL_STATS, mayProvideHistoricalStats} from '#sepal/recipe/capability/baytsHistoricalStats'
import {MALFORMED, PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from '#sepal/recipe/capability/providerStep'

// Which types could stand for BAYTS historical statistics, and what one step from a record arrives at.
//
// Candidacy is what a selector may offer. It is not evidence: an asset mosaic is a candidate because it
// stands for whatever its asset holds, and nothing here says the asset holds statistics.

describe('a recipe type asked whether it could provide historical statistics', () => {
    it('could when it declares that it produces them', () => {
        assert.equal(mayProvideHistoricalStats('BAYTS_HISTORICAL'), true)
    })

    it('could when it stands for the asset it wraps', () => {
        assert.equal(mayProvideHistoricalStats('ASSET_MOSAIC'), true)
    })

    it('could when it declares that it preserves its input', () => {
        assert.equal(mayProvideHistoricalStats('MASKING'), true)
    })

    it('could not when it neither produces nor preserves', () => {
        assert.equal(mayProvideHistoricalStats('OPTICAL_MOSAIC'), false)
        assert.equal(mayProvideHistoricalStats('TIME_SERIES'), false)
        assert.equal(mayProvideHistoricalStats('CCDC'), false)
    })

    it('could not when nothing defines it', () => {
        assert.equal(mayProvideHistoricalStats('NO_SUCH_TYPE'), false)
    })
})

describe('one step from a record towards the producer', () => {
    it('stops at a record producing them, on the terms it declares', () => {
        const {status, declared} = step({type: 'BAYTS_HISTORICAL', model: {}})

        assert.equal(status, PRODUCES)
        assert.equal(declared.statsAsset({}), null)
    })

    it('stops at an asset mosaic, which names where they would be read from', () => {
        const model = {assetDetails: {assetId: 'users/x/historical'}}
        const {status, declared} = step({type: 'ASSET_MOSAIC', model})

        assert.equal(status, PRODUCES)
        assert.equal(declared.statsAsset(model), 'users/x/historical')
    })

    it('follows the input a preserving record stands for', () => {
        const {status, reference} = step({
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: 'historical-1'}}
        })

        assert.equal(status, PRESERVES)
        assert.deepEqual(reference, {type: 'RECIPE_REF', id: 'historical-1'})
    })

    // CCDC declares segments, not historical statistics: a declaration answers for the capability that
    // asked for it and for no other.
    it('reports a terminal recipe that produces none', () => {
        assert.equal(step({type: 'CCDC', model: {}}).status, UNSUPPORTED)
    })

    it('reports a preserving role its model does not fill', () => {
        assert.equal(step({type: 'MASKING', model: {}}).status, MALFORMED)
    })
})

const step = record => providerStep(record, BAYTS_HISTORICAL_STATS)
