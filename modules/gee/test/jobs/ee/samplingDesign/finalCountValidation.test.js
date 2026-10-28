import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    classifyFinalCounts,
    classifyStratumCount,
    groupFinalCountFailures
} from '#sepal/ee/samplingDesign/finalCountValidation'

const classify = args => classifyStratumCount({effectiveMinimum: 2, sampleSizeStrategy: 'CLOSEST', ...args})

describe('classifyStratumCount statistical floor', () => {
    it('reports statisticalMinimum for 0 and 1 regardless of configured minimum, request or strategy', () => {
        for (const actual of [0, 1]) {
            for (const sampleSizeStrategy of ['CLOSEST', 'OVER', 'EXACT']) {
                assert.equal(
                    classify({actual, requested: 100, effectiveMinimum: 10, sampleSizeStrategy}),
                    'statisticalMinimum'
                )
            }
            assert.equal(
                classify({actual, requested: 1, effectiveMinimum: 2, arrangementStrategy: 'RANDOM'}),
                'statisticalMinimum'
            )
        }
    })

    it('accepts 2 against a minimum of 2 under CLOSEST even when the request is far larger', () => {
        assert.equal(classify({actual: 2, requested: 100, effectiveMinimum: 2}), 'valid')
    })
})

describe('classifyStratumCount configured minimum', () => {
    it('reports configuredMinimum when at/above the statistical floor but below the configured minimum', () => {
        assert.equal(
            classify({actual: 2, requested: 100, effectiveMinimum: 10}),
            'configuredMinimum'
        )
        assert.equal(
            classify({actual: 7, requested: 100, effectiveMinimum: 10}),
            'configuredMinimum'
        )
    })

    it('takes priority over an unmet request', () => {
        assert.equal(
            classify({actual: 7, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}),
            'configuredMinimum'
        )
    })
})

describe('classifyStratumCount requested allocation', () => {
    it('lets CLOSEST undershoot the request once the minimum is met', () => {
        assert.equal(classify({actual: 25, requested: 100, effectiveMinimum: 10}), 'valid')
    })

    it('requires the request under OVER and EXACT', () => {
        assert.equal(
            classify({actual: 25, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}),
            'requestedAllocation'
        )
        assert.equal(
            classify({actual: 25, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}),
            'requestedAllocation'
        )
    })

    it('requires the request for random sampling whatever the systematic sample-size strategy', () => {
        assert.equal(
            classify({actual: 25, requested: 100, effectiveMinimum: 10, arrangementStrategy: 'RANDOM'}),
            'requestedAllocation'
        )
    })

    it('is valid when the request is met', () => {
        assert.equal(
            classify({actual: 100, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}),
            'valid'
        )
    })
})

describe('classifyFinalCounts / groupFinalCountFailures', () => {
    const allocation = [
        {stratum: 1, label: 'water', sampleSize: 100},
        {stratum: 2, label: 'snow', sampleSize: 100},
        {stratum: 3, label: 'crops', sampleSize: 100},
        {stratum: 4, label: 'bare', sampleSize: 100}
    ]
    const counts = {1: 1, 2: 7, 3: 25, 4: 100}

    it('keeps only failures, classified by highest-priority reason, and drops valid strata', () => {
        assert.deepEqual(
            classifyFinalCounts({counts, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}),
            [
                {stratum: 1, label: 'water', actual: 1, requested: 100, kind: 'statisticalMinimum'},
                {stratum: 2, label: 'snow', actual: 7, requested: 100, kind: 'configuredMinimum'},
                {stratum: 3, label: 'crops', actual: 25, requested: 100, kind: 'requestedAllocation'}
            ]
        )
    })

    it('treats a stratum missing from the histogram as zero', () => {
        assert.deepEqual(
            classifyFinalCounts({counts: {}, allocation: [allocation[0]], effectiveMinimum: 2, sampleSizeStrategy: 'CLOSEST'}),
            [{stratum: 1, label: 'water', actual: 0, requested: 100, kind: 'statisticalMinimum'}]
        )
    })

    it('groups multiple strata by reason in reporting order', () => {
        const failures = classifyFinalCounts({counts, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'})
        assert.deepEqual(
            groupFinalCountFailures(failures).map(({kind, strata}) => [kind, strata.map(s => s.label)]),
            [
                ['statisticalMinimum', ['water']],
                ['configuredMinimum', ['snow']],
                ['requestedAllocation', ['crops']]
            ]
        )
    })

    it('reports nothing when every stratum satisfies its contract', () => {
        assert.deepEqual(
            classifyFinalCounts({counts: {1: 100, 2: 100, 3: 100, 4: 100}, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}),
            []
        )
    })
})
