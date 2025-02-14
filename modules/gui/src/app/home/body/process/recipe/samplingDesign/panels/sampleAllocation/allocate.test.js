import {allocate} from './allocate'

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
