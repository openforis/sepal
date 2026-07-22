import {isValidNumericEqualityValue, isValidPropertyEqualityValue, propertyEqualityValue, requiresNumericEqualityValue} from './propertyEquality'

describe('propertyEqualityValue', () => {
    it('serializes a KNOWN-numeric property to a number ("08" -> 8)', () => {
        expect(propertyEqualityValue('number', '08')).toBe(8)
        expect(propertyEqualityValue('number', '8')).toBe(8)
        expect(propertyEqualityValue('number', 8)).toBe(8)
        expect(propertyEqualityValue('number', '0')).toBe(0)
    })

    it('preserves a KNOWN-string property as a string (numeric-looking "08" stays "08")', () => {
        expect(propertyEqualityValue('string', '08')).toBe('08')
        expect(propertyEqualityValue('string', 8)).toBe('8')
    })

    it('preserves the raw value for an unknown/absent type (backward-compatible + categorical path)', () => {
        expect(propertyEqualityValue('unknown', '08')).toBe('08')
        expect(propertyEqualityValue(undefined, '08')).toBe('08')
        expect(propertyEqualityValue('unknown', '1')).toBe('1')
    })

    it('a known-numeric conversion of malformed text is NaN - which is why validation must gate it', () => {
        expect(Number.isNaN(propertyEqualityValue('number', 'abc'))).toBe(true)
    })
})

describe('isValidNumericEqualityValue', () => {
    it('accepts finite numbers and numeric-looking strings, including "08" and zero', () => {
        expect(isValidNumericEqualityValue('8')).toBe(true)
        expect(isValidNumericEqualityValue('08')).toBe(true)
        expect(isValidNumericEqualityValue('0')).toBe(true)
        expect(isValidNumericEqualityValue(8)).toBe(true)
    })

    it('rejects malformed numeric text (so it never persists as NaN)', () => {
        expect(isValidNumericEqualityValue('abc')).toBe(false)
        expect(isValidNumericEqualityValue('8px')).toBe(false)
    })

    it('rejects blank-like values so whitespace never slips through as numeric 0', () => {
        expect(isValidNumericEqualityValue('')).toBe(false)
        expect(isValidNumericEqualityValue('   ')).toBe(false)
        expect(isValidNumericEqualityValue(null)).toBe(false)
        expect(isValidNumericEqualityValue(false)).toBe(false)
        expect(isValidNumericEqualityValue(NaN)).toBe(false)
    })
})

describe('requiresNumericEqualityValue', () => {
    it('applies only to property equality on a known-numeric property', () => {
        expect(requiresNumericEqualityValue('=', 'number')).toBe(true)
        expect(requiresNumericEqualityValue('=', 'string')).toBe(false)
        expect(requiresNumericEqualityValue('=', 'unknown')).toBe(false)
        expect(requiresNumericEqualityValue('<', 'number')).toBe(false)
        expect(requiresNumericEqualityValue('range', 'number')).toBe(false)
    })

})

// isValidPropertyEqualityValue IS the field predicate (constraint.jsx fields.value calls it directly), so
// these assertions cover the actual wiring, not a re-implementation.
describe('isValidPropertyEqualityValue (the production field predicate)', () => {
    it('requires a finite number for numeric-property equality, rejecting text and whitespace', () => {
        expect(isValidPropertyEqualityValue('=', 'number', '8')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'number', '08')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'number', 'forest')).toBe(false)
        expect(isValidPropertyEqualityValue('=', 'number', '   ')).toBe(false)
    })

    it('imposes no numeric requirement for string or unknown properties', () => {
        expect(isValidPropertyEqualityValue('=', 'string', 'forest')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'string', '08')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'unknown', 'forest')).toBe(true)
    })

    it('imposes no numeric requirement for non-equality operators', () => {
        expect(isValidPropertyEqualityValue('<', 'number', 'forest')).toBe(true)
        expect(isValidPropertyEqualityValue('range', 'number', 'forest')).toBe(true)
    })

    it('models type-switch clearing in BOTH directions for the same value', () => {
        // string -> numeric: "forest" becomes invalid (numeric error appears)...
        expect(isValidPropertyEqualityValue('=', 'string', 'forest')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'number', 'forest')).toBe(false)
        // numeric -> string: "08" is valid either way, so switching clears the numeric requirement cleanly.
        expect(isValidPropertyEqualityValue('=', 'number', '08')).toBe(true)
        expect(isValidPropertyEqualityValue('=', 'string', '08')).toBe(true)
    })
})
