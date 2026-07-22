// Generic (no recipe/map deps) helpers for rendering and reconciling categorical equality options in the
// reusable Constraint, shared with its tests.

// Presentation formatting for a categorical filter option: "1 - Forest" when a label is present, otherwise
// "1". A category is never hidden or altered merely because its label is absent.
export const formatCategoricalOptionLabel = ({value, label} = {}) =>
    label != null && `${label}`.trim() !== ''
        ? `${value} - ${label}`
        : `${value}`

// The string form category values use, so a persisted numeric 1 or string "1" reconciles to the "1" option.
export const normalizeCategoricalValue = value =>
    value == null ? '' : typeof value === 'string' ? value.trim() : `${value}`

// Decide how a constraint's current equality value should reconcile against the categorical options:
//   - no options (non-categorical property, or none known): leave it (free-text behavior is unchanged);
//   - already a valid option value: leave it;
//   - normalizes to an option value ("1"/1 -> the "1" option): change to that raw option value;
//   - otherwise a stale value not valid for this property: clear it (unless already empty).
// Returns {change:false} or {change:true, value}. The resolved value is always the option's RAW value - never
// a label or color - so only raw values are ever persisted.
export const reconciledCategoricalValue = (current, options) => {
    if (!options || !options.length) {
        return {change: false}
    }
    if (options.some(({value}) => value === current)) {
        return {change: false}
    }
    const normalized = normalizeCategoricalValue(current)
    const match = options.find(({value}) => value === normalized)
    if (match) {
        return {change: true, value: match.value}
    }
    if (current == null || current === '') {
        return {change: false}
    }
    return {change: true, value: ''}
}
