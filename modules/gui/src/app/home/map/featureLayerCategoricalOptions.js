import {normalizeValue} from './featureLayerStyle'

// value -> label map (asset metadata labels only) for a property, for the Color > By value label column.
// Only options that actually carry a label are included, so a missing label leaves no empty placeholder.
export const categoricalLabelsByValue = (categoricalProperties = {}, property) =>
    (categoricalProperties?.[property] || []).reduce(
        (acc, {value, label}) =>
            label != null && `${label}`.trim() !== ''
                ? {...acc, [value]: label}
                : acc,
        {}
    )

const optionsFromValueColors = (valueColors = {}) =>
    Object.entries(valueColors).map(([value, color]) => ({value: normalizeValue(value), color}))

// The categorical options offered to the Feature Layer filter editor, keyed by property. Combines, in order:
//   1. sourceConfig.categoricalProperties - the labelled baseline parsed from the asset's `*_class_*` metadata;
//   2. defaultStyle.valueColors - the backward-compatible, label-less fallback for its own property, used only
//      when no categoricalProperties baseline exists for that property (older saved sources);
//   3. the current in-panel Color > By value entries for the active valueProperty, so freshly edited colors -
//      and any values the user added - appear in the filter immediately.
// Blank By-value entries are excluded. An edited entry overrides the baseline color for the same value while
// keeping the baseline's label. Machine values stay raw normalized strings; colors/labels are display-only.
export const buildCategoriesByProperty = ({categoricalProperties = {}, defaultStyle, entries = [], valueProperty} = {}) => {
    const byProperty = {}
    Object.entries(categoricalProperties).forEach(([property, options]) => {
        byProperty[property] = options.map(option => ({...option}))
    })
    const fallbackProperty = defaultStyle && defaultStyle.valueProperty
    if (fallbackProperty && !byProperty[fallbackProperty]) {
        const options = optionsFromValueColors(defaultStyle.valueColors)
        if (options.length) {
            byProperty[fallbackProperty] = options
        }
    }
    if (valueProperty) {
        byProperty[valueProperty] = mergeEntries(byProperty[valueProperty] || [], entries)
    }
    return byProperty
}

// Overlay the in-panel By-value entries onto a property's baseline options: override an existing value's color
// (keeping its baseline label), append new values (label-less), and drop blank entries.
const mergeEntries = (baseline, entries) => {
    const merged = baseline.map(option => ({...option}))
    const indexByValue = new Map(merged.map((option, index) => [option.value, index]))
    entries.forEach(entry => {
        const value = normalizeValue(entry.value)
        if (value === '') {
            return
        }
        const existing = indexByValue.has(value) ? merged[indexByValue.get(value)] : null
        const option = existing && existing.label != null
            ? {value, color: entry.color, label: existing.label}
            : {value, color: entry.color}
        if (indexByValue.has(value)) {
            merged[indexByValue.get(value)] = option
        } else {
            indexByValue.set(value, merged.length)
            merged.push(option)
        }
    })
    return merged
}
