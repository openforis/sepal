import {formatCategoricalOptionLabel, normalizeCategoricalValue, reconciledCategoricalValue} from './categoricalOption'

describe('formatCategoricalOptionLabel', () => {
    it('formats "value - label" with a label, bare value without', () => {
        expect(formatCategoricalOptionLabel({value: '1', label: 'Forest'})).toBe('1 - Forest')
        expect(formatCategoricalOptionLabel({value: '1'})).toBe('1')
        expect(formatCategoricalOptionLabel({value: '1', label: '  '})).toBe('1')
        expect(formatCategoricalOptionLabel({value: '0'})).toBe('0')
    })
})

describe('normalizeCategoricalValue', () => {
    it('coerces numbers and trims strings; nil -> empty', () => {
        expect(normalizeCategoricalValue(1)).toBe('1')
        expect(normalizeCategoricalValue(' 1 ')).toBe('1')
        expect(normalizeCategoricalValue(0)).toBe('0')
        expect(normalizeCategoricalValue(null)).toBe('')
        expect(normalizeCategoricalValue(undefined)).toBe('')
    })
})

describe('reconciledCategoricalValue', () => {
    const options = [{value: '1', color: '#a', label: 'Forest'}, {value: '2', color: '#b'}]

    it('leaves non-categorical constraints (no options) untouched, preserving free-text behavior', () => {
        expect(reconciledCategoricalValue('anything', undefined)).toEqual({change: false})
        expect(reconciledCategoricalValue('anything', [])).toEqual({change: false})
    })

    it('keeps a value that is already a valid option (raw string)', () => {
        expect(reconciledCategoricalValue('1', options)).toEqual({change: false})
    })

    it('resolves a persisted numeric value to the matching raw option value', () => {
        expect(reconciledCategoricalValue(1, options)).toEqual({change: true, value: '1'})
    })

    it('resolves a persisted string value to the matching option (identity, no color/label)', () => {
        // The resolved value is the raw option value only - never the label or color.
        expect(reconciledCategoricalValue('2', options)).toEqual({change: false})
        expect(reconciledCategoricalValue(2, options)).toEqual({change: true, value: '2'})
    })

    it('clears a stale value that is not valid for the categorical property', () => {
        expect(reconciledCategoricalValue('forest', options)).toEqual({change: true, value: ''})
    })

    it('does not thrash an already-empty value', () => {
        expect(reconciledCategoricalValue('', options)).toEqual({change: false})
        expect(reconciledCategoricalValue(null, options)).toEqual({change: false})
    })
})
