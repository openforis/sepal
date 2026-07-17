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
                expect(classify({actual, requested: 100, effectiveMinimum: 10, sampleSizeStrategy}))
                    .toBe('statisticalMinimum')
            }
            expect(classify({actual, requested: 1, effectiveMinimum: 2, arrangementStrategy: 'RANDOM'}))
                .toBe('statisticalMinimum')
        }
    })

    it('accepts 2 against a minimum of 2 under CLOSEST even when the request is far larger', () => {
        expect(classify({actual: 2, requested: 100, effectiveMinimum: 2})).toBe('valid')
    })
})

describe('classifyStratumCount configured minimum', () => {
    it('reports configuredMinimum when at/above the statistical floor but below the configured minimum', () => {
        expect(classify({actual: 2, requested: 100, effectiveMinimum: 10})).toBe('configuredMinimum')
        expect(classify({actual: 7, requested: 100, effectiveMinimum: 10})).toBe('configuredMinimum')
    })

    it('takes priority over an unmet request', () => {
        expect(classify({actual: 7, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}))
            .toBe('configuredMinimum')
    })
})

describe('classifyStratumCount requested allocation', () => {
    it('lets CLOSEST undershoot the request once the minimum is met', () => {
        expect(classify({actual: 25, requested: 100, effectiveMinimum: 10})).toBe('valid')
    })

    it('requires the request under OVER and EXACT', () => {
        expect(classify({actual: 25, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}))
            .toBe('requestedAllocation')
        expect(classify({actual: 25, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}))
            .toBe('requestedAllocation')
    })

    it('requires the request for random sampling whatever the systematic sample-size strategy', () => {
        expect(classify({actual: 25, requested: 100, effectiveMinimum: 10, arrangementStrategy: 'RANDOM'}))
            .toBe('requestedAllocation')
    })

    it('is valid when the request is met', () => {
        expect(classify({actual: 100, requested: 100, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}))
            .toBe('valid')
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
        expect(classifyFinalCounts({counts, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'}))
            .toEqual([
                {stratum: 1, label: 'water', actual: 1, requested: 100, kind: 'statisticalMinimum'},
                {stratum: 2, label: 'snow', actual: 7, requested: 100, kind: 'configuredMinimum'},
                {stratum: 3, label: 'crops', actual: 25, requested: 100, kind: 'requestedAllocation'}
            ])
    })

    it('treats a stratum missing from the histogram as zero', () => {
        expect(classifyFinalCounts({counts: {}, allocation: [allocation[0]], effectiveMinimum: 2, sampleSizeStrategy: 'CLOSEST'}))
            .toEqual([{stratum: 1, label: 'water', actual: 0, requested: 100, kind: 'statisticalMinimum'}])
    })

    it('groups multiple strata by reason in reporting order', () => {
        const failures = classifyFinalCounts({counts, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'OVER'})
        expect(groupFinalCountFailures(failures).map(({kind, strata}) => [kind, strata.map(s => s.label)]))
            .toEqual([
                ['statisticalMinimum', ['water']],
                ['configuredMinimum', ['snow']],
                ['requestedAllocation', ['crops']]
            ])
    })

    it('reports nothing when every stratum satisfies its contract', () => {
        expect(classifyFinalCounts({counts: {1: 100, 2: 100, 3: 100, 4: 100}, allocation, effectiveMinimum: 10, sampleSizeStrategy: 'EXACT'}))
            .toEqual([])
    })
})
