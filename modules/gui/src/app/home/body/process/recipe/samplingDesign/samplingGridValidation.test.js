import {describe, expect, it} from 'vitest'

import {isValidGridScale, isValidStratificationTransform} from './samplingGridValidation'

describe('isValidGridScale', () => {
    it('accepts finite positive numbers and numeric strings', () => {
        expect(isValidGridScale(10)).toBe(true)
        expect(isValidGridScale('30')).toBe(true)
    })

    it('rejects empty, zero, negative and non-numeric scales', () => {
        expect(isValidGridScale('')).toBe(false)
        expect(isValidGridScale(undefined)).toBe(false)
        expect(isValidGridScale(0)).toBe(false)
        expect(isValidGridScale(-5)).toBe(false)
        expect(isValidGridScale('abc')).toBe(false)
    })
})

// The transform is OPTIONAL, so blank is valid. When present it must be six finite numbers, north-up, square and
// unrotated - [a, 0, xOrigin, 0, -a, yOrigin].
describe('isValidStratificationTransform', () => {
    it('accepts blank, since the field is optional', () => {
        expect(isValidStratificationTransform('')).toBe(true)
        expect(isValidStratificationTransform('   ')).toBe(true)
        expect(isValidStratificationTransform(undefined)).toBe(true)
    })

    it('accepts a north-up square transform', () => {
        expect(isValidStratificationTransform('[10, 0, 300000, 0, -10, 200000]')).toBe(true)
    })

    it('rejects unparseable text', () => {
        expect(isValidStratificationTransform('nonsense')).toBe(false)
        expect(isValidStratificationTransform('[10, 0, 300000]')).toBe(false)
    })

    it('rejects a sheared transform', () => {
        expect(isValidStratificationTransform('[10, 2, 300000, 0, -10, 200000]')).toBe(false)
        expect(isValidStratificationTransform('[10, 0, 300000, 3, -10, 200000]')).toBe(false)
    })

    it('rejects a transform that is not north-up', () => {
        expect(isValidStratificationTransform('[10, 0, 300000, 0, 10, 200000]')).toBe(false)
    })

    it('rejects a non-square transform', () => {
        expect(isValidStratificationTransform('[10, 0, 300000, 0, -20, 200000]')).toBe(false)
    })
})
