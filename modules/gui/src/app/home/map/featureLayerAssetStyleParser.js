import Color from 'color'
import _ from 'lodash'

import {normalizeValue} from './featureLayerStyle'

// Categorical style convention for EE table/FeatureCollection assets, analogous to the image asset
// `<band>_class_values/palette/names` convention (see assetVisualizationParser). For a property P present in
// the discovered columns, `P_class_values` + `P_class_palette` (comma-separated, commas escaped as in
// visualization metadata) declare a "By value" style. `P_class_names` labels are optional, matched to values
// by index, and surfaced as presentation-only metadata (see parseFeatureLayerCategoricalProperties): they are
// never part of the persisted style/filter, so the EE styling job never receives them.

// Split a comma-separated metadata string, honoring `\,` escapes (decoded back to literal commas, mirroring
// visParams.normalize's label decoding). EMPTY fields are preserved - leading, middle and trailing - so that
// names align to values strictly by index: `Forest,,Urban` yields ['Forest', '', 'Urban'], keeping 'Urban' on
// the third value rather than shifting it onto the second. A blank/whitespace-only string is "no list" ([]).
const splitList = value => {
    if (!_.isString(value) || value.trim() === '') {
        return []
    }
    const parts = []
    let current = ''
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && value[i + 1] === ',') {
            current += ','
            i++
        } else if (value[i] === ',') {
            parts.push(current)
            current = ''
        } else {
            current += value[i]
        }
    }
    parts.push(current)
    return parts.map(part => part.trim())
}

// Normalize a color to hex, tolerating bare 6-digit hex (no `#`). Returns null for anything unparseable, so
// an invalid entry is dropped rather than throwing during Add Asset.
const toHex = color => {
    try {
        return Color(color).hex()
    } catch (_error) {
        if (/^[0-9A-Fa-f]{6}$/.test(color)) {
            try {
                return Color(`#${color}`).hex()
            } catch (_retryError) {
                return null
            }
        }
        return null
    }
}

// Parse one property's categorical convention into ordered {value, color, label?} options, or null when the
// property carries no valid value/color pair. Labels are matched to values by index and omitted when missing
// or blank; a category is never dropped merely because its label is absent. Invalid colors drop only their
// own pair (existing behavior).
const parseCategoricalProperty = (properties, property) => {
    const values = splitList(properties[`${property}_class_values`])
    const palette = splitList(properties[`${property}_class_palette`])
    const names = splitList(properties[`${property}_class_names`])
    if (!values.length || !palette.length) {
        return null
    }
    const options = []
    const seen = new Set()
    const count = Math.min(values.length, palette.length)
    for (let i = 0; i < count; i++) {
        const value = normalizeValue(values[i])
        const color = toHex(palette[i])
        if (value === '' || !color || seen.has(value)) {
            continue
        }
        seen.add(value)
        const label = normalizeValue(names[i])
        options.push(label === '' ? {value, color} : {value, color, label})
    }
    return options.length ? options : null
}

// UI-only style (no labels): the COLORS_BY_VALUE valueColors map for a property, or null. Kept label-free so
// nothing categorical/presentation leaks into the persisted style or the EE styling job.
const parseProperty = (properties, property) => {
    const options = parseCategoricalProperty(properties, property)
    if (!options) {
        return null
    }
    const valueColors = options.reduce((acc, {value, color}) => ({...acc, [value]: color}), {})
    return {colorMode: 'COLORS_BY_VALUE', valueProperty: property, valueColors}
}

// Returns a COLORS_BY_VALUE style for the first column carrying a valid categorical convention, or null. Only
// properties present in `columns` are considered, so stray `*_class_*` metadata for non-columns is ignored.
// The returned style is deliberately label-free (see parseProperty).
export const parseFeatureLayerAssetStyle = ({properties = {}, columns = []} = {}) => {
    for (const column of columns) {
        const style = parseProperty(properties, column)
        if (style) {
            return style
        }
    }
    return null
}

// Presentation metadata for EVERY column carrying a valid categorical convention:
//   {[property]: [{value, color, label?}]}
// Retained in sourceConfig so the Feature Layer filter (and the By-value label column) can render categories,
// their colors and optional labels. Machine values stay raw strings; labels/colors are display-only and are
// never persisted in individual filter constraints. Returns {} when no column carries the convention.
export const parseFeatureLayerCategoricalProperties = ({properties = {}, columns = []} = {}) => {
    const categoricalProperties = {}
    for (const column of columns) {
        const options = parseCategoricalProperty(properties, column)
        if (options) {
            categoricalProperties[column] = options
        }
    }
    return categoricalProperties
}
