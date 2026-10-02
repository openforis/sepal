import {describe, expect, it} from 'vitest'

import {UNAVAILABLE} from '../sourceEvidence'
import {hasSegmentDescription} from './referenceEvidence'

// What Change Alerts presents about the segments it monitors against (segmentEvidence.test.js reads the description).

const MASKING = {type: 'RECIPE_REF', id: 'masking-1'}

// An operation over a source nothing can be said about is not offered.
describe('whether there is a segment description to present', () => {
    it('is reported as absent once a read has failed, and present while the copy answers', () => {
        const failed = alerts({
            reference: {...MASKING, bands: ['red_coefs']},
            evidence: {sourceKey: 'RECIPE_REF:masking-1', status: UNAVAILABLE}
        })

        expect(hasSegmentDescription(failed)).toBe(false)
        expect(hasSegmentDescription(alerts({reference: {...MASKING, bands: ['red_coefs']}}))).toBe(true)
        expect(hasSegmentDescription(alerts({reference: MASKING}))).toBe(false)
    })
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
