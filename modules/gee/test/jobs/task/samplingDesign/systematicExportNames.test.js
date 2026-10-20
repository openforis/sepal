import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {candidateAssetId, candidateDescription} from '#gee/jobs/task/samplingDesign/systematicExportNames'

const JARGON = ['unfiltered', 'densityOffset', '_base', '_repair']

describe('candidateAssetId', () => {
    const tempAssetId = 'users/x/output_tmp_20260101120000000'

    it('derives distinct temporary base and repair asset ids from the temp prefix', () => {
        const base = candidateAssetId(tempAssetId, 'base')
        const repair = candidateAssetId(tempAssetId, 'repair')
        assert.equal(base, `${tempAssetId}_candidates`)
        assert.equal(repair, `${tempAssetId}_additional_candidates`)
        assert.notEqual(base, repair)
    })

    it('keeps the temporary prefix so ids stay unique and clearly temporary', () => {
        assert.ok(candidateAssetId(tempAssetId, 'base').includes('_tmp_'))
    })

    it('does not expose implementation jargon in the asset id', () => {
        const ids = [candidateAssetId(tempAssetId, 'base'), candidateAssetId(tempAssetId, 'repair')]
        ids.forEach(id => JARGON.forEach(term => assert.ok(!id.includes(term))))
    })
})

describe('candidateDescription', () => {
    const description = 'My sample design'

    it('produces valid Earth Engine task names for both candidate exports', () => {
        assert.equal(
            candidateDescription(description, 'base'),
            'Prepare_sample_candidates_My_sample_design'
        )
        assert.equal(
            candidateDescription(description, 'repair'),
            'Prepare_additional_sample_candidates_My_sample_design'
        )
    })

    it('produces distinct base and repair descriptions', () => {
        assert.notEqual(
            candidateDescription(description, 'base'),
            candidateDescription(description, 'repair')
        )
    })

    it('does not expose implementation jargon in the description', () => {
        const descriptions = [candidateDescription('out', 'base'), candidateDescription('out', 'repair')]
        descriptions.forEach(text => JARGON.forEach(term => assert.ok(!text.includes(term))))
    })
})
