import _ from 'lodash'
import {forkJoin, map} from 'rxjs'

import {job} from '#gee/jobs/job'
import {createFilter, equalityFilter} from '#sepal/ee/asset/filter'
import ee from '#sepal/ee/ee'
import {filterTable} from '#sepal/ee/table'
import {fileName} from '#sepal/path'

const STYLE_PROPERTY = '__sepalStyle'

const worker$ = ({
    requestArgs: {tableId, columnName, columnValue, buffer, color = '#FFFFFF50', fillColor = '#FFFFFF08', pointSize, width, style, featureFilter}
}) => {

    const parsedStyle = style ? JSON.parse(style) : null
    const parsedFeatureFilter = featureFilter ? JSON.parse(featureFilter) : null
    const bufferMeters = (buffer && _.toNumber(buffer)) * 1000
    const sourceTable = filterTable({tableId, columnName, columnValue})
    const filteredTable = parsedFeatureFilter?.constraints?.length
        ? sourceTable.filter(createFilter([parsedFeatureFilter]))
        : sourceTable
    const buffered = collection => bufferMeters
        ? collection.map(feature => feature.buffer(ee.Number(bufferMeters), bufferMeters / 10))
        : collection
    // Rendered tiles reflect the feature filter (may be empty). Map framing uses the UNFILTERED source bounds:
    // a feature filter matching zero features yields an empty geometry, and bounds() on an empty geometry fails
    // the whole request. Framing on the source keeps the map usable while the filtered tiles stay empty. Legacy
    // callers (no featureFilter) have sourceTable === filteredTable, so their framing is unchanged.
    const table = buffered(filteredTable)
    const boundsTable = buffered(sourceTable)
    const bounds = bufferMeters
        ? boundsTable.geometry().bounds(bufferMeters / 10).buffer(ee.Number(bufferMeters), bufferMeters / 10).bounds(bufferMeters / 10)
        : boundsTable.geometry().bounds()
    const boundsPolygon = ee.List(bounds.coordinates().get(0))
    const styled = parsedStyle
        ? styleTable(table, parsedStyle)
        : legacyStyle(table, {color, fillColor, pointSize, width})
    return forkJoin({
        bounds: ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds'),
        eeMap: ee.getMap$(styled, null, 'create ee table map')
    }).pipe(
        map(({bounds, eeMap}) => ({bounds, ...eeMap}))
    )
}

// Legacy callers (e.g. AOI) pass flat color/fillColor/pointSize/width. Only add pointSize/width when
// supplied, so those callers keep EE's default styling.
const legacyStyle = (table, {color, fillColor, pointSize, width}) => {
    const style = {color, fillColor}
    if (pointSize != null) {
        style.pointSize = _.toNumber(pointSize)
    }
    if (width != null) {
        style.width = _.toNumber(width)
    }
    return table.style(style)
}

const styleTable = (table, style) => {
    switch (style.colorMode) {
        case 'COLORS_FROM_PROPERTY': return styleByColorColumn(table, style)
        case 'COLORS_BY_VALUE': return styleByValue(table, style)
        default: return styleSingle(table, style)
    }
}

const baseStyle = ({width, pointSize}) => ({
    width: _.toNumber(width),
    pointSize: _.toNumber(pointSize)
})

const styleSingle = (table, style) =>
    table.style({
        ...baseStyle(style),
        color: style.color,
        fillColor: withAlpha(style.color, style.fillOpacity)
    })

// Per-feature color read from a feature property, falling back to the global color when the property is
// missing/null. Hex colors get the configured fill opacity; other color strings pass through unchanged.
const styleByColorColumn = (table, style) => {
    const {colorProperty, color, fillOpacity} = style
    const styled = table.map(feature => {
        const featureColor = ee.String(ee.Algorithms.If(feature.get(colorProperty), feature.get(colorProperty), color))
        return feature.set(STYLE_PROPERTY, {
            ...baseStyle(style),
            color: featureColor,
            fillColor: withAlpha$(featureColor, fillOpacity)
        })
    })
    return styled.style({styleProperty: STYLE_PROPERTY, neighborhood: neighborhood(style)})
}

// Map distinct property values to colors. Style each value's subset separately and mosaic, which avoids
// server-side value-to-string coercion and works for numeric or string value properties.
const styleByValue = (table, style) => {
    const {valueProperty, valueColors = {}, fillOpacity} = style
    const values = Object.keys(valueColors)
    if (!values.length) {
        // No listed values: draw nothing. Style the table then fully mask it, yielding a valid (empty)
        // image rather than rendering every feature in the hidden default color.
        return styleSingle(table, style).updateMask(0)
    }
    // Render only features matching a listed value. The by-value UI has no global color, so unmatched
    // values are not drawn rather than painted in a hidden/stale default color.
    const valueImages = values.map(value =>
        table.filter(equalityFilter(valueProperty, value)).style({
            ...baseStyle(style),
            color: valueColors[value],
            fillColor: withAlpha(valueColors[value], fillOpacity)
        })
    )
    return ee.ImageCollection(valueImages).mosaic()
}

// Feature-specific styles with larger pointSize/width need a neighborhood covering pointSize + width to
// avoid tiling artifacts.
const neighborhood = style => Math.ceil(_.toNumber(style.pointSize) + _.toNumber(style.width)) + 1

const withAlpha = (color, opacity) => {
    const hex = String(color).replace('#', '').slice(0, 6)
    if (hex.length !== 6) {
        return color
    }
    const alpha = Math.round(_.clamp(_.toNumber(opacity), 0, 1) * 255).toString(16).padStart(2, '0')
    return `#${hex}${alpha}`
}

const withAlpha$ = (color, opacity) => {
    const alpha = alphaHex(opacity)
    const isHex = color.match('^#?[0-9a-fA-F]{6}$').size().gt(0)
    const hex = color.replace('#', '').slice(0, 6)
    return ee.Algorithms.If(isHex, ee.String('#').cat(hex).cat(alpha), color)
}

const alphaHex = opacity =>
    Math.round(_.clamp(_.toNumber(opacity), 0, 1) * 255).toString(16).padStart(2, '0')

export default job({
    jobName: 'Request EE Table map',
    jobPath: fileName(import.meta.url),
    worker$
})
