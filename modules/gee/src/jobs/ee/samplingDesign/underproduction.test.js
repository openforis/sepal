import {describeStratum, randomUnderproductionUserMessage, shortfallDetails} from '#sepal/ee/samplingDesign/underproduction'

describe('describeStratum', () => {
    it('formats with label and stratum', () => {
        expect(describeStratum({stratum: 1, label: 'trees', available: 231, requested: 373}))
            .toBe('trees (stratum 1): 231 available / 373 requested')
    })

    it('falls back to "stratum n" without a label', () => {
        expect(describeStratum({stratum: 5, available: 0, requested: 10}))
            .toBe('stratum 5: 0 available / 10 requested')
    })
})

describe('shortfallDetails', () => {
    const allocation = [
        {stratum: 1, label: 'trees', sampleSize: 373},
        {stratum: 7, label: 'bare', sampleSize: 100}
    ]

    it('returns only strata below their requested size, with available counts', () => {
        expect(shortfallDetails({counts: {1: 373, 7: 40}, allocation})).toEqual([
            {stratum: 7, label: 'bare', available: 40, requested: 100}
        ])
    })

    it('treats a missing count as 0 available (underproducing)', () => {
        expect(shortfallDetails({counts: {1: 373}, allocation})).toEqual([
            {stratum: 7, label: 'bare', available: 0, requested: 100}
        ])
    })

    it('returns none when every stratum meets its requested size', () => {
        expect(shortfallDetails({counts: {1: 400, 7: 100}, allocation})).toEqual([])
    })
})

describe('randomUnderproductionUserMessage', () => {
    const details = [
        {stratum: 1, label: 'trees', available: 231, requested: 373},
        {stratum: 7, available: 0, requested: 100}
    ]

    const STRATA_DETAIL = 'trees (stratum 1): 231 available / 373 requested; stratum 7: 0 available / 100 requested'

    it('routes to the minDistance key with a {strata} template and the per-stratum detail in args', () => {
        const {key, message, args} = randomUnderproductionUserMessage({details, hasMinDistance: true})
        expect(key).toBe('tasks.samplingDesign.random.underproduced.minDistance')
        expect(message).toContain('{strata}')
        expect(args.strata).toBe(STRATA_DETAIL)
    })

    it('routes to a different (insufficientArea) key with the same {strata} template and detail when minDistance is not configured', () => {
        const {key, message, args} = randomUnderproductionUserMessage({details, hasMinDistance: false})
        expect(key).toBe('tasks.samplingDesign.random.underproduced.insufficientArea')
        expect(message).toContain('{strata}')
        expect(args.strata).toBe(STRATA_DETAIL)
    })
})
