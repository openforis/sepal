import {nonRepairableStrata, repairExtraOffsets, repairOffset, underproducingStrata, underproductionDetails, underproductionUserMessage} from '#sepal/ee/samplingDesign/systematicRepair'

const allocation = [
    {stratum: 1, sampleSize: 100},
    {stratum: 2, sampleSize: 50}
]

const summaryOf = raw => ({raw, actual: raw, levels: {}})

describe('underproducingStrata', () => {
    it('returns none when every stratum has enough raw candidates', () => {
        expect(underproducingStrata({summary: summaryOf({1: 100, 2: 60}), allocation})).toEqual([])
        expect(underproducingStrata({summary: summaryOf({1: 250, 2: 50}), allocation})).toEqual([])
    })

    it('detects strata whose raw candidate count is below the requested size', () => {
        const under = underproducingStrata({summary: summaryOf({1: 40, 2: 60}), allocation})
        expect(under.map(({stratum}) => stratum)).toEqual([1])
    })

    it('treats a missing stratum count as zero (underproducing)', () => {
        const under = underproducingStrata({summary: summaryOf({2: 60}), allocation})
        expect(under.map(({stratum}) => stratum)).toEqual([1])
    })
})

describe('repairExtraOffsets', () => {
    it('is 0 when already sufficient', () => {
        expect(repairExtraOffsets({rawCount: 100, requested: 100})).toBe(0)
        expect(repairExtraOffsets({rawCount: 200, requested: 100})).toBe(0)
    })

    it('is 1 for a deficit up to 4x', () => {
        expect(repairExtraOffsets({rawCount: 50, requested: 100})).toBe(1) // 2x
        expect(repairExtraOffsets({rawCount: 25, requested: 100})).toBe(1) // 4x
    })

    it('is 2 for a deficit above 4x up to 16x', () => {
        expect(repairExtraOffsets({rawCount: 24, requested: 100})).toBe(2) // >4x
        expect(repairExtraOffsets({rawCount: 100, requested: 1600})).toBe(2) // 16x
    })

    it('is 3 for a deficit above 16x up to 64x', () => {
        expect(repairExtraOffsets({rawCount: 100, requested: 1700})).toBe(3) // >16x
        expect(repairExtraOffsets({rawCount: 100, requested: 6400})).toBe(3) // 64x
    })

    it('treats a zero raw count as a 1x floor to stay finite', () => {
        expect(repairExtraOffsets({rawCount: 0, requested: 4})).toBe(1)
        expect(repairExtraOffsets({rawCount: 0, requested: 5})).toBe(2)
    })
})

describe('repairOffset', () => {
    const maxOffsetOf = () => 10

    it('returns baseOffset when nothing needs densifying', () => {
        expect(repairOffset({underproducing: [], summary: summaryOf({}), baseOffset: 0, maxOffsetOf})).toBe(0)
    })

    it('takes the largest per-stratum estimate plus the safety margin', () => {
        // stratum 1: 4x -> 1 extra; stratum 2: >16x -> 3 extra. max=3, +safety(1) = 4.
        const under = [
            {stratum: 1, sampleSize: 100},
            {stratum: 2, sampleSize: 100}
        ]
        const summary = summaryOf({1: 25, 2: 5})
        expect(repairOffset({underproducing: under, summary, baseOffset: 0, maxOffsetOf})).toBe(4)
    })

    it('adds baseOffset', () => {
        const under = [{stratum: 1, sampleSize: 100}]
        expect(repairOffset({underproducing: under, summary: summaryOf({1: 50}), baseOffset: 2, maxOffsetOf})).toBe(4) // 2 + 1 + 1
    })

    it('clamps each stratum\'s target to that stratum\'s own max offset', () => {
        const under = [{stratum: 1, sampleSize: 100}]
        expect(repairOffset({underproducing: under, summary: summaryOf({1: 1}), baseOffset: 0, maxOffsetOf: () => 2})).toBe(2)
    })

    it('returns baseOffset when every failing stratum is already at its own minimum-distance limit', () => {
        const under = [{stratum: 1, sampleSize: 100}]
        // stratum can't densify (its own max == baseOffset), so no repair is possible.
        expect(repairOffset({underproducing: under, summary: summaryOf({1: 10}), baseOffset: 0, maxOffsetOf: () => 0})).toBe(0)
    })

    it('densifies only for failing strata that can still be densified (per-stratum limit)', () => {
        const under = [
            {stratum: 1, sampleSize: 100}, // at its own limit (max 0)
            {stratum: 2, sampleSize: 100} // can densify (max 5)
        ]
        const summary = summaryOf({1: 10, 2: 10})
        const maxByStratum = ({stratum}) => stratum === 1 ? 0 : 5
        // stratum 1 clamps to 0; stratum 2: >4x -> 2 extra +1 = 3. max = 3 (> base), so a repair runs.
        expect(repairOffset({underproducing: under, summary, baseOffset: 0, maxOffsetOf: maxByStratum})).toBe(3)
    })
})

describe('nonRepairableStrata', () => {
    it('returns failing strata already at their own minimum-distance limit', () => {
        const under = [{stratum: 1, sampleSize: 100}, {stratum: 2, sampleSize: 100}]
        const maxOffsetOf = ({stratum}) => stratum === 1 ? 0 : 5
        expect(nonRepairableStrata({underproducing: under, baseOffset: 0, maxOffsetOf}).map(({stratum}) => stratum)).toEqual([1])
    })

    it('returns none when every failing stratum can still be densified', () => {
        const under = [{stratum: 1, sampleSize: 100}]
        expect(nonRepairableStrata({underproducing: under, baseOffset: 0, maxOffsetOf: () => 3})).toEqual([])
    })
})

describe('underproductionDetails', () => {
    it('reports available (raw), requested, label, and stratum', () => {
        const strata = [{stratum: 1, label: 'trees', sampleSize: 373}]
        expect(underproductionDetails({summary: summaryOf({1: 231}), strata})).toEqual([
            {stratum: 1, label: 'trees', available: 231, requested: 373}
        ])
    })

    it('treats a missing raw count as 0 available', () => {
        const strata = [{stratum: 7, label: 'bare', sampleSize: 2164}]
        expect(underproductionDetails({summary: summaryOf({}), strata})).toEqual([
            {stratum: 7, label: 'bare', available: 0, requested: 2164}
        ])
    })
})

describe('underproductionUserMessage', () => {
    const details = [
        {stratum: 1, label: 'trees', available: 231, requested: 373},
        {stratum: 7, label: 'bare', available: 900, requested: 2164}
    ]

    it('uses the min-distance-limit key and a {strata} template with each failing stratum in args', () => {
        const {key, message, args} = underproductionUserMessage({details, reason: 'minDistanceLimit'})
        expect(key).toBe('tasks.samplingDesign.systematic.underproduced.minDistanceLimit')
        expect(message).toContain('{strata}')
        expect(args.strata).toBe('trees (stratum 1): 231 available / 373 requested; bare (stratum 7): 900 available / 2164 requested')
    })

    it('routes a repair-exhausted reason to a different key with the same {strata} template', () => {
        const {key, message} = underproductionUserMessage({details: [details[0]], reason: 'repairExhausted'})
        expect(key).toBe('tasks.samplingDesign.systematic.underproduced.repairExhausted')
        expect(key).not.toBe('tasks.samplingDesign.systematic.underproduced.minDistanceLimit')
        expect(message).toContain('{strata}')
    })

    it('falls back to "stratum N" in args when a label is missing', () => {
        const {args} = underproductionUserMessage({details: [{stratum: 5, available: 0, requested: 10}], reason: 'repairExhausted'})
        expect(args.strata).toBe('stratum 5: 0 available / 10 requested')
    })
})
