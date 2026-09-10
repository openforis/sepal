import {describe, expect, it} from 'vitest'

import {
    availableBandsOf,
    baseBandsOf,
    chartSourceReference,
    dateFormatOf,
    materializedTemplates,
    outputBandsOf,
    segmentDescription
} from './sliceEvidence'

// What a CCDC Slice recipe answers about the segments it slices, from the evidence in force. Fixtures are the
// smallest shapes the source panel and the older sourceSync wrote, over one measure.

const DESCRIBED = {
    bands: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude', 'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
    baseBands: [{name: 'ndvi', measures: ['value', 'rmse', 'magnitude']}],
    segmentBands: [{name: 'tStart'}, {name: 'tEnd'}, {name: 'tBreak'}, {name: 'numObs'}, {name: 'changeProb'}],
    dateFormat: 1,
    startDate: '2015-01-01',
    endDate: '2021-01-01',
    visualizations: [
        {id: 'v-ndvi', bands: ['ndvi'], type: 'continuous'},
        {id: 'v-harmonic', bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'], type: 'hsv'},
        {id: 'v-nbr', bands: ['nbr'], type: 'continuous'}
    ]
}

// A recipe saved by an older GUI, carrying a copy beside its reference.
const COPIED = {
    type: 'RECIPE_REF',
    id: 'ccdc-1',
    bands: ['nbr_coefs', 'tStart'],
    baseBands: [{name: 'nbr', bandTypes: ['value']}],
    segmentBands: [{name: 'tStart'}],
    dateFormat: null,
    startDate: '2000-01-01',
    endDate: '2020-01-01',
    visualizations: [{id: 'v-old', bands: ['nbr'], type: 'continuous'}]
}

const sliceOf = ({source, sourceEvidence, dateType = 'SINGLE', gapStrategy = 'MASK', harmonics = 3} = {}) => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    model: {source, date: {dateType, date: '2020-06-01'}, options: {gapStrategy, harmonics}},
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const observed = (sourceKey, segments) => ({sourceKey, status: 'OBSERVED', segments})

describe('a slice whose source has been observed', () => {
    const recipe = sliceOf({source: COPIED, sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED)})

    it('answers from the observation, not the copy', () => {
        expect(segmentDescription(recipe).status).toBe('OBSERVED')
        expect(baseBandsOf(recipe).map(({name}) => name)).toEqual(['ndvi'])
    })

    it('derives the scalar bands its operation produces from the physical bands the source carries', () => {
        expect(outputBandsOf(recipe)).toEqual([
            'ndvi',
            'ndvi_intercept', 'ndvi_slope',
            'ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_phase_2', 'ndvi_amplitude_2', 'ndvi_phase_3', 'ndvi_amplitude_3',
            'ndvi_rmse', 'ndvi_magnitude', 'ndvi_breakConfidence',
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'
        ])
    })

    it('offers every derived band, all scalar', () => {
        expect(Object.keys(availableBandsOf(recipe))).toContain('ndvi_phase_2')
    })

    // A template is offered only where this slice produces every band it names. `nbr` was never fitted by
    // this source, so its template describes nothing this recipe makes; it is withheld, not deleted.
    it('materializes the source templates against what it actually produces', () => {
        expect(materializedTemplates(recipe).map(({id}) => id)).toEqual(['v-ndvi', 'v-harmonic'])
        expect(DESCRIBED.visualizations.map(({id}) => id)).toContain('v-nbr')
    })

    it('interprets dates the way the source represents them', () => {
        expect(dateFormatOf(recipe)).toBe(1)
    })
})

// The operation decides which bands exist, and a template describing bands it does not produce is not
// offered. Interpolating with no harmonics is the case that was advertised wrongly.
describe('an operation asked for no harmonics', () => {
    const interpolating = sliceOf({
        source: COPIED,
        sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED),
        gapStrategy: 'INTERPOLATE',
        harmonics: 0
    })

    it('produces no harmonic bands', () => {
        expect(outputBandsOf(interpolating).filter(band => band.includes('phase'))).toEqual([])
    })

    it('does not offer the harmonic template that names them', () => {
        expect(materializedTemplates(interpolating).map(({id}) => id)).toEqual(['v-ndvi'])
    })

    it('offers it again once harmonics are asked for', () => {
        const withHarmonics = sliceOf({
            source: COPIED,
            sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED),
            gapStrategy: 'INTERPOLATE',
            harmonics: 1
        })

        expect(materializedTemplates(withHarmonics).map(({id}) => id)).toEqual(['v-ndvi', 'v-harmonic'])
    })
})

// A consumer resolving this recipe as a dependency supplies the description itself, because a recipe it has
// merely loaded has no runtime evidence of its own.
describe('a description supplied by a consumer', () => {
    const unopened = sliceOf({source: {type: 'RECIPE_REF', id: 'ccdc-1'}})

    it('is used in place of runtime evidence', () => {
        expect(baseBandsOf(unopened, DESCRIBED).map(({name}) => name)).toEqual(['ndvi'])
        expect(materializedTemplates(unopened, DESCRIBED).map(({id}) => id)).toEqual(['v-ndvi', 'v-harmonic'])
    })

    it('leaves the recipe answering nothing without it', () => {
        expect(baseBandsOf(unopened)).toEqual([])
        expect(materializedTemplates(unopened)).toEqual([])
    })
})

// A base band's measures are read one way, whatever spelling the description arrived in.
describe('the measures of a base band', () => {
    it('are read from a copy an older GUI saved under its own spelling', () => {
        expect(baseBandsOf(sliceOf({source: COPIED}))).toEqual([{name: 'nbr', measures: ['value']}])
    })

    it('are read from an observation unchanged', () => {
        const recipe = sliceOf({source: COPIED, sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED)})

        expect(baseBandsOf(recipe)).toEqual([{name: 'ndvi', measures: ['value', 'rmse', 'magnitude']}])
    })
})

describe('a slice whose source has not been observed', () => {
    const recipe = sliceOf({source: COPIED})

    it('falls back to the copy an older GUI saved, saying so', () => {
        expect(segmentDescription(recipe).status).toBe('UNOBSERVED')
        expect(baseBandsOf(recipe).map(({name}) => name)).toEqual(['nbr'])
        expect(outputBandsOf(recipe)).toContain('nbr_phase_1')
    })

    it('answers nothing from a recipe that carries no copy either', () => {
        const bare = sliceOf({source: {type: 'RECIPE_REF', id: 'ccdc-1'}})

        expect(segmentDescription(bare).description).toBeNull()
        expect(baseBandsOf(bare)).toEqual([])
        expect(outputBandsOf(bare)).toEqual([])
    })
})

// Evidence that could not be had is not a reason to answer from a copy made when things were different.
describe('a slice whose source could not be observed', () => {
    const recipe = sliceOf({
        source: COPIED,
        sourceEvidence: {sourceKey: 'RECIPE_REF:ccdc-1', status: 'UNAVAILABLE'}
    })

    it('answers nothing, rather than the copy', () => {
        expect(segmentDescription(recipe).status).toBe('UNAVAILABLE')
        expect(baseBandsOf(recipe)).toEqual([])
        expect(materializedTemplates(recipe)).toEqual([])
    })
})

describe('evidence about a source the recipe no longer selects', () => {
    it('is not used', () => {
        const recipe = sliceOf({
            source: {type: 'RECIPE_REF', id: 'ccdc-2'},
            sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED)
        })

        expect(segmentDescription(recipe).status).toBe('UNOBSERVED')
        expect(baseBandsOf(recipe)).toEqual([])
    })
})

// The date representation is configuration for an asset and evidence for a recipe. Zero is Julian days,
// a value, not an absence.
describe('the date representation', () => {
    const assetSource = dateFormat => ({type: 'ASSET', id: 'users/x/segments', dateFormat})
    const assetEvidence = observed('ASSET:users/x/segments', {...DESCRIBED, dateFormat: 2})

    it('is what the user configured for an asset, over what its metadata says', () => {
        expect(dateFormatOf(sliceOf({source: assetSource(1), sourceEvidence: assetEvidence}))).toBe(1)
    })

    it('preserves a configured zero', () => {
        expect(dateFormatOf(sliceOf({source: assetSource(0), sourceEvidence: assetEvidence}))).toBe(0)
    })

    it('is the metadata value for an asset nobody configured', () => {
        expect(dateFormatOf(sliceOf({source: assetSource(undefined), sourceEvidence: assetEvidence}))).toBe(2)
    })

    it('is the source\'s for a recipe, whatever an older copy says', () => {
        const recipe = sliceOf({
            source: {...COPIED, dateFormat: 0},
            sourceEvidence: observed('RECIPE_REF:ccdc-1', DESCRIBED)
        })

        expect(dateFormatOf(recipe)).toBe(1)
    })

    it('falls back to the copy for a recipe source not yet observed', () => {
        expect(dateFormatOf(sliceOf({source: {...COPIED, dateFormat: 2}}))).toBe(2)
    })

    it('is Julian days when nothing at all says otherwise', () => {
        expect(dateFormatOf(sliceOf({source: {type: 'RECIPE_REF', id: 'ccdc-1'}}))).toBe(0)
    })
})

// The pixel-chart endpoint takes the reference the recipe selected and resolves the rest from the source.
describe('the reference handed to the pixel chart', () => {
    it('is the selected recipe, with nothing copied beside it', () => {
        expect(chartSourceReference(sliceOf({source: COPIED}))).toEqual({type: 'RECIPE_REF', id: 'ccdc-1'})
    })

    it('carries the configured date representation for an asset, zero included', () => {
        expect(chartSourceReference(sliceOf({source: {type: 'ASSET', id: 'users/x/segments', dateFormat: 0}})))
            .toEqual({type: 'ASSET', id: 'users/x/segments', dateFormat: 0})
    })

    it('never carries a target type from a previous source', () => {
        const recipe = sliceOf({source: {...COPIED, targetType: 'ASSET_MOSAIC'}})

        expect(chartSourceReference(recipe)).not.toHaveProperty('targetType')
    })
})
