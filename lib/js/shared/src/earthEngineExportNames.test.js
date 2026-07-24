import {
    isValidEarthEngineAssetId,
    sanitizeEarthEngineAssetId,
    sanitizeEarthEngineTaskName
} from './earthEngineExportNames.js'

describe('sanitizeEarthEngineTaskName', () => {
    it('replaces unsupported runs with one underscore', () => {
        expect(sanitizeEarthEngineTaskName('Prepare samples: Sudan 2024')).toBe('Prepare_samples_Sudan_2024')
    })

    it('preserves supported characters and removes accents', () => {
        expect(sanitizeEarthEngineTaskName('Forêt-loss_2024')).toBe('Foret-loss_2024')
    })

    it('uses the supplied fallback when no alphanumeric characters remain', () => {
        expect(sanitizeEarthEngineTaskName('***', 'Sampling_design')).toBe('Sampling_design')
    })
})

describe('sanitizeEarthEngineAssetId', () => {
    it('sanitizes each asset path segment without removing separators', () => {
        expect(sanitizeEarthEngineAssetId('projects/my-project/assets/Sudan samples/table 1'))
            .toBe('projects/my-project/assets/Sudan_samples/table_1')
    })

    it('leaves valid legacy and project asset IDs unchanged', () => {
        expect(sanitizeEarthEngineAssetId('users/name/folder/sample.v1')).toBe('users/name/folder/sample.v1')
        expect(sanitizeEarthEngineAssetId('projects/my-project/assets/sample_1')).toBe('projects/my-project/assets/sample_1')
    })

    it('preserves an absent value', () => {
        expect(sanitizeEarthEngineAssetId(undefined)).toBeUndefined()
        expect(sanitizeEarthEngineAssetId('')).toBe('')
    })
})

describe('isValidEarthEngineAssetId', () => {
    it('rejects whitespace and unsupported characters', () => {
        expect(isValidEarthEngineAssetId('users/name/sample 1')).toBe(false)
        expect(isValidEarthEngineAssetId('users/name/sample?1')).toBe(false)
    })

    it('accepts valid and blank values', () => {
        expect(isValidEarthEngineAssetId('users/name/sample-1')).toBe(true)
        expect(isValidEarthEngineAssetId('')).toBe(true)
    })
})
