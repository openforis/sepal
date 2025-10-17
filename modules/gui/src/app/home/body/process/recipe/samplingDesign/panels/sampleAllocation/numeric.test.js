import '@vitest/web-worker'

import {allocateToSampleSize} from './numeric'

it('allocate to sample size', async () => {
    const strata = [
        {weight: 0.4569405161813575, proportion: 0.001835916175260226},
        {weight: 0.315563594510594, proportion: 0.008075947721366702},
        {weight: 0.16399273770975095, proportion: 0.020040878208534587},
        {weight: 0.053931241849443264, proportion: 0.04356016521762776},
        {weight: 0.009571909748854225, proportion: 0.1020494509379209},
    ]
    const sampleSize = 3000
    const minSamplesPerStratum = 2
    const confidenceLevel = 0.95
    expect(toAllocation(
        await allocateToSampleSize({strata, sampleSize, minSamplesPerStratum, confidenceLevel})
    )).toEqual([50, 50])
})

// it('big', async () => {
//     const strata = [
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//         {weight: 0.1, proportion: 0.5},
//     ]
//     const sampleSize = 1e5
//     const minSamplesPerStratum = 1
//     const confidenceLevel = 0.95
//     expect(toAllocation(
//         await allocateToSampleSize({strata, sampleSize, minSamplesPerStratum, confidenceLevel})
//     )).toEqual([50, 50])
// }, {timeout: 30000})

const toAllocation = strata =>
    strata.map(({sampleSize}) => sampleSize)

