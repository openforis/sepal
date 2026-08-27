import {describe, expect, it} from 'vitest'

import {includeCrs, includeMinDistance} from './arrangementApplicability'

describe('includeMinDistance', () => {
    it('is true for systematic and false for random', () => {
        expect(includeMinDistance({arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
        expect(includeMinDistance({arrangementStrategy: 'RANDOM'})).toBe(false)
    })

    it('is false for an unset arrangement', () => {
        expect(includeMinDistance({})).toBe(false)
    })
})

describe('includeCrs', () => {
    // The Arrangement CRS is the PLACEMENT grid. It applies wherever samples are placed on a grid - which is
    // every mode except Unstratified Random, whose draw has no grid at all.
    it('applies to Unstratified Systematic', () => {
        expect(includeCrs({unstratified: true, arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
    })

    it('applies to both stratified modes, which now own a placement CRS of their own', () => {
        expect(includeCrs({unstratified: false, arrangementStrategy: 'RANDOM'})).toBe(true)
        expect(includeCrs({unstratified: false, arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
    })

    it('does not apply to Unstratified Random, which has no grid', () => {
        expect(includeCrs({unstratified: true, arrangementStrategy: 'RANDOM'})).toBe(false)
    })
})
