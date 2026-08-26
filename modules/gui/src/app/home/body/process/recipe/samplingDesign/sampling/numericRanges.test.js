import {describe, expect, it} from 'vitest'

import {
    isValidConfidenceLevel,
    isValidMarginOfError,
    isValidOptionalProportionPercentage,
    isValidPowerTuningConstant,
    isValidProportionPercentage
} from './numericRanges'

// Planning-input ranges enforced by the Allocation and Proportions panels. Boundaries matter: a 0% or 100%
// confidence level describes no usable interval, while proportions are inclusive percentages.
describe('isValidConfidenceLevel', () => {
    it('excludes both endpoints', () => {
        expect(isValidConfidenceLevel(0)).toBe(false)
        expect(isValidConfidenceLevel(100)).toBe(false)
    })

    it('accepts values strictly inside the range', () => {
        for (const value of [0.1, 90, 95, '95', 99.9]) {
            expect(isValidConfidenceLevel(value)).toBe(true)
        }
    })

    it('rejects out-of-range and non-numeric values', () => {
        for (const value of [-1, 101, '', 'abc', null, undefined]) {
            expect(isValidConfidenceLevel(value)).toBe(false)
        }
    })
})

describe('isValidPowerTuningConstant', () => {
    it('includes both endpoints', () => {
        expect(isValidPowerTuningConstant(0)).toBe(true)
        expect(isValidPowerTuningConstant(1)).toBe(true)
    })

    it('accepts values inside the range and rejects values outside it', () => {
        expect(isValidPowerTuningConstant(0.5)).toBe(true)
        expect(isValidPowerTuningConstant('0.75')).toBe(true)
        expect(isValidPowerTuningConstant(-0.1)).toBe(false)
        expect(isValidPowerTuningConstant(1.1)).toBe(false)
        expect(isValidPowerTuningConstant('abc')).toBe(false)
    })
})

describe('isValidProportionPercentage', () => {
    it('includes both endpoints and rejects values outside them', () => {
        expect(isValidProportionPercentage(0)).toBe(true)
        expect(isValidProportionPercentage(100)).toBe(true)
        expect(isValidProportionPercentage(48)).toBe(true)
        expect(isValidProportionPercentage(-1)).toBe(false)
        expect(isValidProportionPercentage(101)).toBe(false)
    })

    // Blank is deliberately left to the field's own .notBlank() validator, which runs first, so this rule
    // never has to produce a "required" message of its own.
    it('rejects a non-numeric value', () => {
        expect(isValidProportionPercentage('abc')).toBe(false)
        expect(isValidProportionPercentage(undefined)).toBe(false)
    })
})

// The overall override is optional: leaving it blank means the per-stratum estimates are used as-is.
describe('isValidOptionalProportionPercentage', () => {
    it('treats blank as valid', () => {
        for (const value of ['', '  ', null, undefined]) {
            expect(isValidOptionalProportionPercentage(value)).toBe(true)
        }
    })

    it('applies the percentage range to a supplied value', () => {
        expect(isValidOptionalProportionPercentage(0)).toBe(true)
        expect(isValidOptionalProportionPercentage(100)).toBe(true)
        expect(isValidOptionalProportionPercentage(101)).toBe(false)
        expect(isValidOptionalProportionPercentage(-1)).toBe(false)
        expect(isValidOptionalProportionPercentage('abc')).toBe(false)
    })
})

// The error-mode target. Zero would demand an infinite sample, so the bound is strict, and a blank field is
// a target nobody has given rather than a target of nothing.
describe('isValidMarginOfError', () => {
    it('accepts any positive percentage, as a number or as the string a field holds', () => {
        expect(isValidMarginOfError(0.1)).toBe(true)
        expect(isValidMarginOfError(50)).toBe(true)
        expect(isValidMarginOfError('50')).toBe(true)
        expect(isValidMarginOfError(1000)).toBe(true)
    })

    it('rejects zero and anything below it', () => {
        expect(isValidMarginOfError(0)).toBe(false)
        expect(isValidMarginOfError('0')).toBe(false)
        expect(isValidMarginOfError(-1)).toBe(false)
    })

    it('rejects a target nobody has given', () => {
        expect(isValidMarginOfError(undefined)).toBe(false)
        expect(isValidMarginOfError(null)).toBe(false)
        expect(isValidMarginOfError('')).toBe(false)
        expect(isValidMarginOfError('   ')).toBe(false)
    })

    it('rejects values that are not numbers at all', () => {
        expect(isValidMarginOfError('half')).toBe(false)
        expect(isValidMarginOfError(NaN)).toBe(false)
        expect(isValidMarginOfError(Infinity)).toBe(false)
    })
})
