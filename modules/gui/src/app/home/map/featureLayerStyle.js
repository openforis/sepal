import Color from 'color'
import _ from 'lodash'

export const COLOR_MODES = ['ONE_COLOR', 'COLORS_FROM_PROPERTY', 'COLORS_BY_VALUE']

const isValidColor = color => {
    try {
        Color(color)
        return true
    } catch (_error) {
        return false
    }
}

// First-pass, geometry-agnostic styling for EE table (FeatureCollection) overlays. See
// docs/ee-feature-asset-overlays-design.md "Styling Model". `opacity` is whole-layer tile opacity
// (renderer-level), separate from `fillOpacity` which affects polygon/point fill.
export const DEFAULT_FEATURE_LAYER_STYLE = {
    colorMode: 'ONE_COLOR',
    color: '#FFD166',
    colorProperty: 'color',
    valueProperty: '',
    valueColors: {},
    width: 1,
    fillOpacity: 0.25,
    pointSize: 4,
    opacity: 1
}

export const normalizeValue = value => _.isNil(value) ? '' : _.isString(value) ? value.trim() : `${value}`
export const isBlankValue = value => normalizeValue(value) === ''

// Local, pre-Apply validation for the feature layer options modal. ONE_COLOR is always valid.
// COLORS_FROM_PROPERTY needs a color property. COLORS_BY_VALUE needs a value property plus at least one
// entry, each with a non-blank value (string values are allowed) and a valid color (the HEX text field is
// unguarded).
export const isFeatureLayerStyleValid = ({style, entries = []}) => {
    switch (style.colorMode) {
        case 'COLORS_FROM_PROPERTY':
            return !isBlankValue(style.colorProperty)
        case 'COLORS_BY_VALUE':
            return !isBlankValue(style.valueProperty)
                && entries.length > 0
                && entries.every(({value, color}) => !isBlankValue(value) && isValidColor(color))
        default:
            return true
    }
}

const hasColorProperty = source =>
    !!(source && source.sourceConfig && Array.isArray(source.sourceConfig.columns) && source.sourceConfig.columns.includes('color'))

// Resolve the effective style: defaults <- source default <- color-property default <- per-area override.
// A source's `sourceConfig.defaultStyle` (e.g. the categorical "By value" style parsed from an asset's
// `<property>_class_*` metadata) outranks the `color`-property heuristic, so a table carrying both a `color`
// column and `stratum_class_*` metadata defaults to COLORS_BY_VALUE, not COLORS_FROM_PROPERTY. Absent a
// defaultStyle, a `color` column still defaults to COLORS_FROM_PROPERTY. An explicit per-area
// layerConfig.style always wins and is never clobbered.
export const resolveFeatureLayerStyle = ({layerConfig, source} = {}) => {
    const explicitStyle = layerConfig && layerConfig.style
    const defaultStyle = source && source.sourceConfig && source.sourceConfig.defaultStyle
    const colorPropertyDefault = !explicitStyle && !defaultStyle && hasColorProperty(source)
        ? {colorMode: 'COLORS_FROM_PROPERTY', colorProperty: 'color'}
        : {}
    return {
        ...DEFAULT_FEATURE_LAYER_STYLE,
        ...defaultStyle,
        ...colorPropertyDefault,
        ...explicitStyle
    }
}

// The full effective style with only `opacity` replaced, for persisting a row-level opacity change. Built
// from the resolved style (not a bare {opacity}) so color mode, valueColors, width, pointSize and
// fillOpacity are all preserved rather than clobbered when the layer had no explicit style yet.
export const withUpdatedOpacity = ({layerConfig, source, opacity}) => ({
    ...resolveFeatureLayerStyle({layerConfig, source}),
    opacity
})

// After a source's schema is lazily loaded, adopt the resolved default (which may switch to color-property
// mode). "Untouched" means the current style still equals what we resolved before the schema loaded - any
// in-modal edit (even within ONE_COLOR mode) makes it touched, so it's preserved rather than re-resolved and
// wiped. An explicit per-area style is preserved by resolveFeatureLayerStyle's precedence.
export const styleAfterColumnsLoaded = ({style, layerConfig, source, columns}) => {
    if (!_.isEqual(style, resolveFeatureLayerStyle({layerConfig, source}))) {
        return style
    }
    const sourceWithColumns = {...source, sourceConfig: {...(source && source.sourceConfig), columns}}
    return resolveFeatureLayerStyle({layerConfig, source: sourceWithColumns})
}
