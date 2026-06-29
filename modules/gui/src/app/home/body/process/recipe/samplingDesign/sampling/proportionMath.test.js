import {maxAnticipatedTargetProportion, smartRound, toProportions} from './proportionMath'

const strata = [
    {value: 1, label: 'a', color: '#111111', area: 100, weight: 0.3},
    {value: 2, label: 'b', color: '#222222', area: 200, weight: 0.7},
]

describe('maxAnticipatedTargetProportion', () => {
    it('returns 100 when there are no probabilities', () => {
        expect(maxAnticipatedTargetProportion({strata, probabilityPerStratum: null})).toBe(100)
    })

    it('returns 100 (never NaN) when probabilities are empty', () => {
        expect(maxAnticipatedTargetProportion({strata, probabilityPerStratum: []})).toBe(100)
    })

    it('returns 100 (never NaN) when every probability is zero', () => {
        expect(maxAnticipatedTargetProportion({
            strata,
            probabilityPerStratum: [{stratum: 1, probability: 0}, {stratum: 2, probability: 0}]
        })).toBe(100)
    })

    it('computes a finite bound from non-zero probabilities', () => {
        const result = maxAnticipatedTargetProportion({
            strata,
            probabilityPerStratum: [{stratum: 1, probability: 0.2}, {stratum: 2, probability: 0.5}]
        })
        expect(Number.isFinite(result)).toBe(true)
        expect(result).toBeGreaterThan(0)
    })
})

describe('toProportions', () => {
    it('produces zero proportions (never NaN) for empty probabilities', () => {
        const result = toProportions({percentage: false, targetOverallProportion: 50, strata, probabilityPerStratum: []})
        expect(result.map(({proportion}) => proportion)).toEqual([0, 0])
    })

    it('produces zero proportions (never NaN) when every probability is zero', () => {
        const result = toProportions({
            percentage: false,
            targetOverallProportion: 50,
            strata,
            probabilityPerStratum: [{stratum: 1, probability: 0}, {stratum: 2, probability: 0}]
        })
        expect(result.every(({proportion}) => Number.isFinite(proportion))).toBe(true)
        expect(result.map(({proportion}) => proportion)).toEqual([0, 0])
    })

    it('scales probabilities to a finite proportion when probabilities are present', () => {
        const result = toProportions({
            percentage: false,
            targetOverallProportion: 30,
            strata,
            probabilityPerStratum: [{stratum: 1, probability: 0.4}, {stratum: 2, probability: 0.2}]
        })
        expect(result.every(({proportion}) => Number.isFinite(proportion))).toBe(true)
        expect(result.some(({proportion}) => proportion > 0)).toBe(true)
    })
})

describe('smartRound', () => {
    it('rounds to two decimals', () => {
        expect(smartRound(0.12345)).toBe(0.12)
    })

    it('keeps precision for very small numbers instead of rounding to zero', () => {
        const result = smartRound(0.0001234)
        expect(result).not.toBe(0)
        expect(result).toBeCloseTo(0.00012, 6)
    })

    it('passes through zero and falsy values', () => {
        expect(smartRound(0)).toBe(0)
    })
})
