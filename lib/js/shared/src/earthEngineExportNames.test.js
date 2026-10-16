import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    isValidEarthEngineAssetId,
    sanitizeEarthEngineAssetId,
    sanitizeEarthEngineTaskName
} from './earthEngineExportNames.js'

describe('sanitizeEarthEngineTaskName', () => {
    it('replaces unsupported runs with one underscore', () => {
        assert.equal(
            sanitizeEarthEngineTaskName('Prepare samples: Sudan 2024'),
            'Prepare_samples_Sudan_2024'
        )
    })

    it('preserves supported characters and removes accents', () => {
        assert.equal(sanitizeEarthEngineTaskName('Forêt-loss_2024'), 'Foret-loss_2024')
    })

    it('uses the supplied fallback when no alphanumeric characters remain', () => {
        assert.equal(sanitizeEarthEngineTaskName('***', 'Sampling_design'), 'Sampling_design')
    })
})

describe('sanitizeEarthEngineAssetId', () => {
    it('sanitizes each asset path segment without removing separators', () => {
        assert.equal(
            sanitizeEarthEngineAssetId('projects/my-project/assets/Sudan samples/table 1'),
            'projects/my-project/assets/Sudan_samples/table_1'
        )
    })

    it('leaves valid legacy and project asset IDs unchanged', () => {
        assert.equal(
            sanitizeEarthEngineAssetId('users/name/folder/sample.v1'),
            'users/name/folder/sample.v1'
        )
        assert.equal(
            sanitizeEarthEngineAssetId('projects/my-project/assets/sample_1'),
            'projects/my-project/assets/sample_1'
        )
    })

    it('preserves an absent value', () => {
        assert.equal(sanitizeEarthEngineAssetId(undefined), undefined)
        assert.equal(sanitizeEarthEngineAssetId(''), '')
    })
})

describe('isValidEarthEngineAssetId', () => {
    it('rejects whitespace and unsupported characters', () => {
        assert.equal(isValidEarthEngineAssetId('users/name/sample 1'), false)
        assert.equal(isValidEarthEngineAssetId('users/name/sample?1'), false)
    })

    it('accepts valid and blank values', () => {
        assert.equal(isValidEarthEngineAssetId('users/name/sample-1'), true)
        assert.equal(isValidEarthEngineAssetId(''), true)
    })
})
