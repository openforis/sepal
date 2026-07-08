import {candidateAssetId, candidateDescription} from './systematicExportNames.js'

const JARGON = ['unfiltered', 'densityOffset', '_base', '_repair']

describe('candidateAssetId', () => {
    const tempAssetId = 'users/x/output_tmp_20260101120000000'

    it('derives distinct temporary base and repair asset ids from the temp prefix', () => {
        const base = candidateAssetId(tempAssetId, 'base')
        const repair = candidateAssetId(tempAssetId, 'repair')
        expect(base).toBe(`${tempAssetId}_candidates`)
        expect(repair).toBe(`${tempAssetId}_additional_candidates`)
        expect(base).not.toBe(repair)
    })

    it('keeps the temporary prefix so ids stay unique and clearly temporary', () => {
        expect(candidateAssetId(tempAssetId, 'base')).toContain('_tmp_')
    })

    it('does not expose implementation jargon in the asset id', () => {
        const ids = [candidateAssetId(tempAssetId, 'base'), candidateAssetId(tempAssetId, 'repair')]
        ids.forEach(id => JARGON.forEach(term => expect(id).not.toContain(term)))
    })
})

describe('candidateDescription', () => {
    it('produces a plain user-facing base description', () => {
        expect(candidateDescription('My sample design', 'base')).toBe('Prepare sample candidates: My sample design')
    })

    it('produces a plain user-facing repair description', () => {
        expect(candidateDescription('My sample design', 'repair')).toBe('Prepare additional sample candidates: My sample design')
    })

    it('does not expose implementation jargon in the description', () => {
        const descriptions = [candidateDescription('out', 'base'), candidateDescription('out', 'repair')]
        descriptions.forEach(text => JARGON.forEach(term => expect(text).not.toContain(term)))
    })
})
