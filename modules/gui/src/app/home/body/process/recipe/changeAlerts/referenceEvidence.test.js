import {describe, expect, it} from 'vitest'

import {OBSERVED, UNAVAILABLE} from '../sourceEvidence'
import {
    baseBandsOf,
    dateFormatOf,
    hasSegmentDescription,
    segmentBandsOf,
    segmentDatesOf
} from './referenceEvidence'

// What Change Alerts presents about the segments it monitors against: current evidence where there is any,
// the copy a recipe saved by an older GUI carries while there is none, and nothing at all once a read has
// failed - never the copy presented as current.

const MASKING = {type: 'RECIPE_REF', id: 'masking-1'}

describe('the segment description', () => {
    it('is the observed one', () => {
        const recipe = alerts({
            reference: MASKING,
            evidence: observed(MASKING, {bands: ['ndvi_coefs'], baseBands: [{name: 'ndvi', measures: ['value']}]})
        })

        expect(segmentBandsOf(recipe)).toEqual(['ndvi_coefs'])
        expect(baseBandsOf(recipe).map(({name}) => name)).toEqual(['ndvi'])
    })

    // A recipe saved before this migration carries a copy, and it spelled measures `bandTypes`.
    it('is the saved copy while nothing has been observed', () => {
        const recipe = alerts({
            reference: {
                ...MASKING,
                bands: ['red_coefs'],
                baseBands: [{name: 'red', bandTypes: ['value', 'rmse']}],
                startDate: '2015-01-01',
                endDate: '2021-01-01'
            }
        })

        expect(segmentBandsOf(recipe)).toEqual(['red_coefs'])
        expect(baseBandsOf(recipe)).toEqual([{name: 'red', measures: ['value', 'rmse']}])
        expect(segmentDatesOf(recipe)).toEqual({startDate: '2015-01-01', endDate: '2021-01-01'})
    })

    it('is withheld once a read of the selected source has failed', () => {
        const recipe = alerts({
            reference: {...MASKING, bands: ['red_coefs']},
            evidence: {sourceKey: 'RECIPE_REF:masking-1', status: UNAVAILABLE}
        })

        expect(segmentBandsOf(recipe)).toEqual([])
        expect(baseBandsOf(recipe)).toEqual([])
    })

    // An operation over a source nothing can be said about is not offered.
    it('is reported as absent once a read has failed, and present while the copy answers', () => {
        const failed = alerts({
            reference: {...MASKING, bands: ['red_coefs']},
            evidence: {sourceKey: 'RECIPE_REF:masking-1', status: UNAVAILABLE}
        })

        expect(hasSegmentDescription(failed)).toBe(false)
        expect(hasSegmentDescription(alerts({reference: {...MASKING, bands: ['red_coefs']}}))).toBe(true)
        expect(hasSegmentDescription(alerts({reference: MASKING}))).toBe(false)
    })

    it('is not taken from evidence about a source that is no longer selected', () => {
        const recipe = alerts({
            reference: MASKING,
            evidence: observed({type: 'RECIPE_REF', id: 'other'}, {bands: ['other_coefs']})
        })

        expect(segmentBandsOf(recipe)).toEqual([])
    })
})

describe('the date representation', () => {
    it('is the producer\'s for a recipe reference', () => {
        const recipe = alerts({
            reference: {...MASKING, dateFormat: 1},
            evidence: observed(MASKING, {dateFormat: 2})
        })

        expect(dateFormatOf(recipe)).toBe(2)
    })

    // An asset's is configuration the user may have corrected, zero included.
    it('is what an asset source was configured with, zero included', () => {
        const asset = {type: 'ASSET', id: 'users/x/segments'}
        const recipe = alerts({
            reference: {...asset, dateFormat: 0},
            evidence: observed(asset, {dateFormat: 2})
        })

        expect(dateFormatOf(recipe)).toBe(0)
    })

    it('falls back to what was saved beside the reference while nothing has been observed', () => {
        expect(dateFormatOf(alerts({reference: {...MASKING, dateFormat: 1}}))).toBe(1)
    })
})

const observed = ({type, id}, segments) => ({
    sourceKey: `${type}:${id}`,
    status: OBSERVED,
    segments
})

const alerts = ({reference, evidence}) => ({
    id: 'alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference,
        sources: {band: 'ndvi', dataSets: {LANDSAT: ['RED']}},
        options: {}
    },
    ...(evidence ? {ui: {sourceEvidence: evidence}} : {})
})
