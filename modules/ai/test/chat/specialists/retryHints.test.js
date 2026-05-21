const {retryHintsFromError} = require('#mcp/chat/specialists/retryHints')

describe('retryHintsFromError', () => {

    it('maps STALE_WRITE to a re-prepare hint', () => {
        const hints = retryHintsFromError({code: 'STALE_WRITE', message: 'base hash mismatch', currentModelHash: 'h9'})

        expect(hints).toEqual([{
            kind: 'stale-write',
            message: 'base hash mismatch',
            suggestedAction: expect.stringMatching(/prepare_update/i)
        }])
    })

    it('maps an invalid-array-index apply failure to a replace-whole-array hint', () => {
        const hints = retryHintsFromError(
            {code: 'PATCH_APPLY_FAILED', message: 'invalid array index: /compositeOptions/includedCloudMasking/sentinel2CloudScorePlus'},
            [{op: 'remove', path: '/compositeOptions/includedCloudMasking/sentinel2CloudScorePlus'}]
        )

        expect(hints).toHaveLength(1)
        expect(hints[0]).toMatchObject({kind: 'invalid-array-index'})
        expect(hints[0].suggestedAction).toMatch(/whole array|index-based/i)
    })

    it('maps a replace-on-missing apply failure to an add hint', () => {
        const hints = retryHintsFromError(
            {code: 'PATCH_APPLY_FAILED', message: 'path not found: /compositeOptions/includedCloudMasking'},
            [{op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['landsatCFMask']}]
        )

        expect(hints[0]).toMatchObject({kind: 'missing-path'})
        expect(hints[0].suggestedAction).toMatch(/\badd\b/i)
    })

    it('maps an add-on-existing apply failure to a replace hint', () => {
        const hints = retryHintsFromError(
            {code: 'PATCH_APPLY_FAILED', message: 'path already exists: /dates/targetDate'},
            [{op: 'add', path: '/dates/targetDate', value: '2024-01-01'}]
        )

        expect(hints[0]).toMatchObject({kind: 'existing-path'})
        expect(hints[0].suggestedAction).toMatch(/\breplace\b/i)
    })

    it('turns each VALIDATION_FAILED detail into a validation-dependency hint', () => {
        const hints = retryHintsFromError({
            code: 'VALIDATION_FAILED',
            message: 'recipe model failed validation',
            details: [
                {path: '/compositeOptions/corrections', rule: 'calibrateRequiresMultipleSources', message: 'needs both source groups'},
                {path: '/compositeOptions/includedCloudMasking', rule: 'cloudMaskingMethodAvailability', message: 'Cloud Score+ needs Sentinel-2'}
            ]
        })

        expect(hints).toHaveLength(2)
        expect(hints[0]).toMatchObject({kind: 'validation-dependency', path: '/compositeOptions/corrections'})
        expect(hints[0].message).toMatch(/needs both source groups/)
        expect(hints[0].message).toMatch(/calibrateRequiresMultipleSources/)
        expect(hints[0].suggestedAction).toMatch(/same.*patch|writablePaths/i)
    })

    it('maps INVALID_PATCH to an op-shape hint that preserves recipe intent', () => {
        const hints = retryHintsFromError({code: 'INVALID_PATCH', message: 'operation missing path'})

        expect(hints[0].suggestedAction).toMatch(/op shape|envelope/i)
        expect(hints[0].suggestedAction).not.toMatch(/change.*intent/i)
    })

    it('produces a single generic unknown hint for an unrecognized error, without inventing a path', () => {
        const hints = retryHintsFromError({code: 'WEIRD_FAILURE', message: 'something odd'})

        expect(hints).toHaveLength(1)
        expect(hints[0].kind).toBe('unknown')
        expect(hints[0]).not.toHaveProperty('path')
        expect(hints[0].message).toBe('something odd')
    })
})
