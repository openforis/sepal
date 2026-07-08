import Color from 'color'
import _ from 'lodash'

import {normalizeValue} from './featureLayerStyle'

// Categorical style convention for EE table/FeatureCollection assets, analogous to the image asset
// `<band>_class_values/palette/names` convention (see assetVisualizationParser). For a property P present in
// the discovered columns, `P_class_values` + `P_class_palette` (comma-separated, commas escaped as in
// visualization metadata) declare a "By value" style. `P_class_names` labels are optional and, since the
// feature value/color UI has no label column yet, parsed for tolerance but not surfaced.

// Split a comma-separated metadata string, honoring `\,` escapes and then decoding them back to literal
// commas (mirrors visParams.normalize's label decoding) so a value/label with an embedded comma round-trips.
const splitList = value =>
    _.isString(value)
        ? value.match(/(\\.|[^,])+/g)?.map(part => part.trim().replace(/\\,/g, ',')) || []
        : []

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

const parseProperty = (properties, property) => {
    const values = splitList(properties[`${property}_class_values`])
    const palette = splitList(properties[`${property}_class_palette`])
    if (!values.length || !palette.length) {
        return null
    }
    const valueColors = {}
    const count = Math.min(values.length, palette.length)
    for (let i = 0; i < count; i++) {
        const value = normalizeValue(values[i])
        const color = toHex(palette[i])
        if (value !== '' && color) {
            valueColors[value] = color
        }
    }
    return Object.keys(valueColors).length
        ? {colorMode: 'COLORS_BY_VALUE', valueProperty: property, valueColors}
        : null
}

// Returns a COLORS_BY_VALUE style for the first column carrying a valid categorical convention, or null. Only
// properties present in `columns` are considered, so stray `*_class_*` metadata for non-columns is ignored.
export const parseFeatureLayerAssetStyle = ({properties = {}, columns = []} = {}) => {
    for (const column of columns) {
        const style = parseProperty(properties, column)
        if (style) {
            return style
        }
    }
    return null
}
