import {describe, expect, it} from 'vitest'

import {isValidGridScale, isValidGridTransform} from './samplingGridValidation'

// Mirrors systematicLatticeMath.test.js's isAxisAlignedTransform cases so the GUI validator and the backend
// (modules/task samplingGridValidation.js) can't drift into accepting/rejecting different transforms.
describe('isValidGridTransform', () => {
    it('accepts empty (no transform) and north-up square transforms', () => {
        expect(isValidGridTransform('')).toBe(true)
        expect(isValidGridTransform(undefined)).toBe(true)
        expect(isValidGridTransform('[30,0,15,0,-30,15]')).toBe(true)
        expect(isValidGridTransform('10, 0, 0, 0, -10, 0')).toBe(true)
    })

    it('rejects wrong-length, shear/rotation, non-square, south-up, negative-x and zero pixels', () => {
        expect(isValidGridTransform('30,0,0')).toBe(false)
        expect(isValidGridTransform('[30,1,0,0,-30,0]')).toBe(false) // shear b != 0
        expect(isValidGridTransform('[30,0,0,2,-30,0]')).toBe(false) // shear d != 0
        expect(isValidGridTransform('[30,0,0,0,-60,0]')).toBe(false) // non-square |a| != |e|
        expect(isValidGridTransform('[30,0,0,0,30,0]')).toBe(false) // south-up e > 0
        expect(isValidGridTransform('[-30,0,0,0,-30,0]')).toBe(false) // negative x pixel
        expect(isValidGridTransform('[0,0,0,0,-30,0]')).toBe(false) // zero x pixel
        expect(isValidGridTransform('[30,0,0,0,-30,x]')).toBe(false) // non-numeric
    })
})

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
