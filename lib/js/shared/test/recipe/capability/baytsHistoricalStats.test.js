import {BAYTS_HISTORICAL_STATS, mayProvideHistoricalStats} from '#sepal/recipe/capability/baytsHistoricalStats'
import {MALFORMED, PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from '#sepal/recipe/capability/providerStep'

// Which types could stand for BAYTS historical statistics, and what one step from a record arrives at.
//
// Candidacy is what a selector may offer. It is not evidence: an asset mosaic is a candidate because it
// stands for whatever its asset holds, and nothing here says the asset holds statistics.

describe('a recipe type asked whether it could provide historical statistics', () => {
    it('could when it declares that it produces them', () => {
        expect(mayProvideHistoricalStats('BAYTS_HISTORICAL')).toBe(true)
    })

    it('could when it stands for the asset it wraps', () => {
        expect(mayProvideHistoricalStats('ASSET_MOSAIC')).toBe(true)
    })

    it('could when it declares that it preserves its input', () => {
        expect(mayProvideHistoricalStats('MASKING')).toBe(true)
    })

    it('could not when it neither produces nor preserves', () => {
        expect(mayProvideHistoricalStats('OPTICAL_MOSAIC')).toBe(false)
        expect(mayProvideHistoricalStats('TIME_SERIES')).toBe(false)
        expect(mayProvideHistoricalStats('CCDC')).toBe(false)
    })

    it('could not when nothing defines it', () => {
        expect(mayProvideHistoricalStats('NO_SUCH_TYPE')).toBe(false)
    })
})

describe('one step from a record towards the producer', () => {
    it('stops at a record producing them, on the terms it declares', () => {
        const {status, declared} = step({type: 'BAYTS_HISTORICAL', model: {}})

        expect(status).toBe(PRODUCES)
        expect(declared.statsAsset({})).toBe(null)
    })

    it('stops at an asset mosaic, which names where they would be read from', () => {
        const model = {assetDetails: {assetId: 'users/x/historical'}}
        const {status, declared} = step({type: 'ASSET_MOSAIC', model})

        expect(status).toBe(PRODUCES)
        expect(declared.statsAsset(model)).toBe('users/x/historical')
    })

    it('follows the input a preserving record stands for', () => {
        const {status, reference} = step({
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: 'historical-1'}}
        })

        expect(status).toBe(PRESERVES)
        expect(reference).toEqual({type: 'RECIPE_REF', id: 'historical-1'})
    })

    // CCDC declares segments, not historical statistics: a declaration answers for the capability that
    // asked for it and for no other.
    it('reports a terminal recipe that produces none', () => {
        expect(step({type: 'CCDC', model: {}}).status).toBe(UNSUPPORTED)
    })

    it('reports a preserving role its model does not fill', () => {
        expect(step({type: 'MASKING', model: {}}).status).toBe(MALFORMED)
    })
})

const step = record => providerStep(record, BAYTS_HISTORICAL_STATS)
