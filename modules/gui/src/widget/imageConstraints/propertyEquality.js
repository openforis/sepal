// Type-aware property-equality handling for the reusable Constraint. The EE Asset recipe knows a property's
// type (the `typeof` of the first image's property value, i.e. 'number' or 'string'); the Feature Layer path
// has no schema and passes 'unknown'. Generic (no recipe/map deps) so the Constraint and its tests share one
// implementation. Equality only - ordered and range comparisons are untouched.

// The value to persist for a property-equality constraint, given the known property type:
//   'number'  -> a JavaScript number, so "08" persists as 8 (matched numerically downstream);
//   'string'  -> a string, so numeric-looking "08" stays "08";
//   otherwise -> the raw value unchanged (backward-compatible; also the categorical Feature Layer path, whose
//                raw value is already the exact category value to store).
export const propertyEqualityValue = (type, value) => {
    if (type === 'number') {
        return Number(value)
    }
    if (type === 'string') {
        return value == null ? value : String(value)
    }
    return value
}

// Whether a property-equality value is acceptable for a KNOWN-NUMERIC property. Accepts only a finite number
// or a NON-BLANK numeric string - blank/whitespace, null and false are rejected, so a whitespace value never
// slips through as numeric 0 (Number('   ') === 0), and malformed text like "abc" never persists as NaN.
export const isValidNumericEqualityValue = value =>
    typeof value === 'number'
        ? Number.isFinite(value)
        : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))

// Whether the numeric requirement applies at all: only for a property-equality constraint on a known-numeric
// property. This is what makes switching the selected property (numeric<->string) immediately clear or apply
// the numeric error - the requirement follows `propertyType`, which tracks the selection.
export const requiresNumericEqualityValue = (operator, type) => operator === '=' && type === 'number'

// The production field predicate for the Constraint's `value` field. The field and its tests both call this,
// so the wiring can't silently drift: property equality against a known-numeric property must be a valid
// number; every other operator/type combination imposes no numeric requirement here (blank stays owned by
// .notBlank()).
export const isValidPropertyEqualityValue = (operator, type, value) =>
    !requiresNumericEqualityValue(operator, type) || isValidNumericEqualityValue(value)
