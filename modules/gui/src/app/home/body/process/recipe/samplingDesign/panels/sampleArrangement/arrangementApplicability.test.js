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
    it('is true only for unstratified Systematic', () => {
        expect(includeCrs({unstratified: true, arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
    })

    it('is false for stratified designs and unstratified Random', () => {
        expect(includeCrs({unstratified: false, arrangementStrategy: 'RANDOM'})).toBe(false)
        expect(includeCrs({unstratified: false, arrangementStrategy: 'SYSTEMATIC'})).toBe(false)
        expect(includeCrs({unstratified: true, arrangementStrategy: 'RANDOM'})).toBe(false)
    })
})
