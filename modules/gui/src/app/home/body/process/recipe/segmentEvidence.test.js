import {describe, expect, it} from 'vitest'

import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'

import {baseBandsOf, dateFormatOf, segmentDatesOf, segmentDescription} from './segmentEvidence'
import {OBSERVED, UNAVAILABLE} from './sourceEvidence'

// What a segment consumer knows about the segments its selection supplies: current evidence where there is any, the
// copy a recipe saved by an older GUI carries while there is none, and nothing at all once a read has failed - never
// the copy presented as current. Read through the role a Change Alerts recipe declares for its reference.

describe('the segment description', () => {
    it('is the observed one, not the copy saved beside the selection', () => {
        const recipe = consumer({reference: COPIED, evidence: observed(CCDC, DESCRIBED)})

        expect(segmentDescription(recipe, PRIMARY_IMAGE)).toEqual({status: OBSERVED, description: DESCRIBED})
    })

    // A copy spelled the measures of a base band `bandTypes`.
    it('is the saved copy while nothing has been observed, read in the observed shape', () => {
        const recipe = consumer({reference: COPIED})

        expect(segmentDescription(recipe, PRIMARY_IMAGE).status).toBe('UNOBSERVED')
        expect(baseBandsOf(recipe, PRIMARY_IMAGE)).toEqual([{name: 'nbr', measures: ['value']}])
        expect(segmentDatesOf(recipe, PRIMARY_IMAGE)).toEqual({startDate: '2000-01-01', endDate: '2020-01-01'})
    })

    it('is withheld once a read of the selected source has failed', () => {
        const recipe = consumer({reference: COPIED, evidence: {sourceKey: 'RECIPE_REF:ccdc-1', status: UNAVAILABLE}})

        expect(segmentDescription(recipe, PRIMARY_IMAGE)).toEqual({status: UNAVAILABLE, description: null})
    })

    it('is not taken from evidence about a source that is no longer selected', () => {
        const recipe = consumer({reference: {...CCDC, id: 'ccdc-2'}, evidence: observed(CCDC, DESCRIBED)})

        expect(segmentDescription(recipe, PRIMARY_IMAGE)).toEqual({status: 'UNOBSERVED', description: null})
    })

    // The role is filled only by a reference its type's declaration reads.
    it('is nothing for a selection its type cannot read, whatever was saved beside it', () => {
        const recipe = consumer({reference: {...COPIED, id: ''}, evidence: observed(CCDC, DESCRIBED)})

        expect(segmentDescription(recipe, PRIMARY_IMAGE).description).toBeNull()
        expect(dateFormatOf(recipe, PRIMARY_IMAGE)).toBeUndefined()
    })

    // A consumer resolving the recipe as a dependency supplies the description itself, because a recipe it has merely
    // loaded has no runtime evidence of its own.
    it('is the one a caller supplies, in place of runtime evidence', () => {
        const unopened = consumer({reference: CCDC})

        expect(baseBandsOf(unopened, PRIMARY_IMAGE, DESCRIBED)).toEqual(DESCRIBED.baseBands)
        expect(baseBandsOf(unopened, PRIMARY_IMAGE)).toEqual([])
    })
})

// The date representation is configuration for an asset and evidence for a recipe. Zero is Julian days, a value, not
// an absence.
describe('the date representation', () => {
    const ASSET = {type: 'ASSET', id: 'users/x/segments'}
    const assetEvidence = observed(ASSET, {...DESCRIBED, dateFormat: 2})

    it('is the source\'s for a recipe, whatever an older copy says', () => {
        const recipe = consumer({reference: {...COPIED, dateFormat: 0}, evidence: observed(CCDC, DESCRIBED)})

        expect(dateFormatOf(recipe, PRIMARY_IMAGE)).toBe(DESCRIBED.dateFormat)
    })

    it('is what the user configured for an asset, over what its metadata says, zero included', () => {
        expect(dateFormatOf(consumer({reference: {...ASSET, dateFormat: 1}, evidence: assetEvidence}), PRIMARY_IMAGE)).toBe(1)
        expect(dateFormatOf(consumer({reference: {...ASSET, dateFormat: 0}, evidence: assetEvidence}), PRIMARY_IMAGE)).toBe(0)
    })

    it('is the metadata value for an asset nobody configured', () => {
        expect(dateFormatOf(consumer({reference: ASSET, evidence: assetEvidence}), PRIMARY_IMAGE)).toBe(2)
    })

    it('falls back to what was saved beside the selection while nothing has been observed', () => {
        expect(dateFormatOf(consumer({reference: {...CCDC, dateFormat: 1}}), PRIMARY_IMAGE)).toBe(1)
    })

    it('is left to the consumer when nothing says', () => {
        expect(dateFormatOf(consumer({reference: CCDC}), PRIMARY_IMAGE)).toBeUndefined()
    })
})

const CCDC = {type: 'RECIPE_REF', id: 'ccdc-1'}

const DESCRIBED = {
    bands: ['ndvi_coefs', 'ndvi_rmse', 'tStart', 'tEnd'],
    baseBands: [{name: 'ndvi', measures: ['value', 'rmse']}],
    segmentBands: [{name: 'tStart'}, {name: 'tEnd'}],
    dateFormat: 1,
    startDate: '2015-01-01',
    endDate: '2021-01-01',
    visualizations: []
}

// A selection saved by an older GUI, carrying a copy beside its reference.
const COPIED = {
    ...CCDC,
    bands: ['nbr_coefs', 'tStart'],
    baseBands: [{name: 'nbr', bandTypes: ['value']}],
    segmentBands: [{name: 'tStart'}],
    dateFormat: null,
    startDate: '2000-01-01',
    endDate: '2020-01-01'
}

const observed = ({type, id}, segments) => ({sourceKey: `${type}:${id}`, status: OBSERVED, segments})

const consumer = ({reference, evidence}) => ({
    id: 'alerts-1',
    type: 'CHANGE_ALERTS',
    model: {reference},
    ...(evidence ? {ui: {sourceEvidence: evidence}} : {})
})
