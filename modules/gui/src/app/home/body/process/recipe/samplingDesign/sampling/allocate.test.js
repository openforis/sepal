import {allocate} from './allocate'
import {ALLOCATION_STRATEGIES} from './allocationStrategy'

it('equal allocation of 10 samples between two stratums gives 5 in each stratum', () => {
    expect(allocate({
        sampleSize: 10,
        strategy: 'EQUAL',
        strata: [
            {stratum: 1},
            {stratum: 2},
        ]
    })).toMatchObject([
        {stratum: 1, sampleSize: 5},
        {stratum: 2, sampleSize: 5},
    ])
})

it('equal allocation of 10 samples between four stratums gives sample size of 3, 3, 2, 2', () => {
    expect(allocate({
        sampleSize: 10,
        strategy: 'EQUAL',
        strata: [
            {stratum: 1},
            {stratum: 2},
            {stratum: 3},
            {stratum: 4},
        ]
    })).toMatchObject([
        {stratum: 1, sampleSize: 3},
        {stratum: 2, sampleSize: 3},
        {stratum: 3, sampleSize: 2},
        {stratum: 4, sampleSize: 2},
    ])
})

it('proportional allocation of 100 samples between two stratums with weight 0.1 and 0.9 gives sample size of 10 and 90', () => {
    expect(allocate({
        sampleSize: 100,
        strategy: 'PROPORTIONAL',
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, sampleSize: 10},
        {stratum: 2, weight: 0.9, sampleSize: 90},
    ])
})

it('proportional allocation of 99 samples between two stratums with weight 0.1 and 0.9 gives sample size of 10 and 89', () => {
    expect(allocate({
        sampleSize: 99,
        strategy: 'PROPORTIONAL',
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, sampleSize: 10},
        {stratum: 2, weight: 0.9, sampleSize: 89},
    ])
})

it('optimal allocation of 100 samples between two stratums with weight 0.1 and 0.9, and proportions of 0.5 and 0.1 gives sample size of 16 and 84', () => {
    expect(allocate({
        sampleSize: 100,
        strategy: 'OPTIMAL',
        strata: [
            {stratum: 1, weight: 0.1, proportion: 0.5},
            {stratum: 2, weight: 0.9, proportion: 0.1},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, proportion: 0.5, sampleSize: 16},
        {stratum: 2, weight: 0.9, proportion: 0.1, sampleSize: 84},
    ])
})

it('power allocation of 100 samples between two stratums with weight 0.1 and 0.9, proportions of 0.5 and 0.1, and tuning constant of 0.5 gives sample size of 20 and 80', () => {
    expect(allocate({
        sampleSize: 100,
        strategy: 'POWER',
        strata: [
            {stratum: 1, weight: 0.1, proportion: 0.5},
            {stratum: 2, weight: 0.9, proportion: 0.1},
        ],
        tuningConstant: 0.5
    })).toMatchObject([
        {stratum: 1, weight: 0.1, proportion: 0.5, sampleSize: 20},
        {stratum: 2, weight: 0.9, proportion: 0.1, sampleSize: 80},
    ])
})

it('balanced allocation of 100 samples between two stratums with weight 0.1 and 0.9 gives sample size of 30 and 70', () => {
    expect(allocate({
        sampleSize: 100,
        strategy: 'BALANCED',
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, sampleSize: 30},
        {stratum: 2, weight: 0.9, sampleSize: 70},
    ])
})

it('min samples of 20 with proportional allocation of 100 samples between two stratums with weight 0.1 and 0.9 gives sample size of 20 and 80', () => {
    expect(allocate({
        sampleSize: 100,
        strategy: 'PROPORTIONAL',
        minSamplesPerStratum: 20,
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, sampleSize: 20},
        {stratum: 2, weight: 0.9, sampleSize: 80},
    ])
})

it('min samples of 20 with proportional allocation of 100 samples between two stratums with weight 0.1 and 0.9 gives sample size of 20 and 80', () => {
    expect(allocate({
        sampleSize: 50,
        strategy: 'PROPORTIONAL',
        minSamplesPerStratum: 20,
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toMatchObject([
        {stratum: 1, weight: 0.1, sampleSize: 20},
        {stratum: 2, weight: 0.9, sampleSize: 30},
    ])
})

it('when asking from 10 samples for 2 stratums with a min samples of 8, error is thrown', () => {
    expect(() => allocate({
        sampleSize: 10,
        strategy: 'PROPORTIONAL',
        minSamplesPerStratum: 8,
        strata: [
            {stratum: 1, weight: 0.1},
            {stratum: 2, weight: 0.9},
        ]
    })).toThrowError('minSamplesPerStratum')
})

it('power allocation with all-zero proportions falls back to equal allocation (no NaN)', () => {
    expect(allocate({
        sampleSize: 10,
        strategy: 'POWER',
        tuningConstant: 0.5,
        strata: [
            {stratum: 1, weight: 0.5, proportion: 0},
            {stratum: 2, weight: 0.5, proportion: 0},
        ]
    })).toMatchObject([
        {stratum: 1, sampleSize: 5},
        {stratum: 2, sampleSize: 5},
    ])
})

it('remainder adjustment preserves the requested total after applying per-stratum minimums', () => {
    const allocation = allocate({
        sampleSize: 34,
        strategy: 'POWER',
        minSamplesPerStratum: 8,
        tuningConstant: 0.5,
        strata: [
            {stratum: 0, weight: 0.01, proportion: 0.02},
            {stratum: 1, weight: 0.19, proportion: 0.1},
            {stratum: 2, weight: 0.3, proportion: 0.2},
            {stratum: 3, weight: 0.5, proportion: 0.4},
        ]
    })

    expect(allocation.reduce((total, stratum) => total + stratum.sampleSize, 0)).toBe(34)
    expect(allocation).toMatchObject([
        {stratum: 0, sampleSize: 9},
        {stratum: 1, sampleSize: 8},
        {stratum: 2, sampleSize: 8},
        {stratum: 3, sampleSize: 9},
    ])
})

it('optimal allocation with all-zero proportions falls back to equal allocation (no NaN)', () => {
    expect(allocate({
        sampleSize: 10,
        strategy: 'OPTIMAL',
        strata: [
            {stratum: 1, weight: 0.5, proportion: 0},
            {stratum: 2, weight: 0.5, proportion: 0},
        ]
    })).toMatchObject([
        {stratum: 1, sampleSize: 5},
        {stratum: 2, sampleSize: 5},
    ])
})

it('equal allocation of a single stratum assigns the whole sample size', () => {
    expect(allocate({
        sampleSize: 10,
        strategy: 'EQUAL',
        strata: [{stratum: 1}]
    })).toMatchObject([
        {stratum: 1, sampleSize: 10},
    ])
})

// The strategy table and the allocator have to stay in step: a strategy that is declared but not executable
// is offered in the panel and then throws, and one that is executable but not declared is never resolved to
// and so never reached.
describe('every declared strategy is executable', () => {
    const strata = [{stratum: 1, weight: 0.3, proportion: 0.4}, {stratum: 2, weight: 0.7, proportion: 0.1}]

    it.each(ALLOCATION_STRATEGIES)('allocates the whole total with %s', strategy => {
        const allocation = allocate({sampleSize: 100, strategy, strata, tuningConstant: 0.5})
        expect(allocation.map(({sampleSize}) => sampleSize).reduce((a, b) => a + b)).toBe(100)
    })

    it('rejects a strategy the table does not declare', () => {
        expect(() => allocate({sampleSize: 100, strategy: 'MYSTERY', strata})).toThrow(/Invalid allocation strategy/)
    })
})
