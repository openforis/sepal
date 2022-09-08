import * as turf from '@turf/turf'
import {Subject, of} from 'rxjs'
import {evaluateRow} from './expression'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'

const filter = (row, {filterExpression}) =>
    filterExpression.value === undefined || !filterExpression.value.length
        ? true
        : !!evaluateRow({row, expression: filterExpression.value})

const validLocation = (row, {locationType, geoJsonColumn, xColumn, yColumn}) =>
    locationType.value === 'GEO_JSON' // TODO: Improve validation
        ? toGeoJSON(row[geoJsonColumn.value]).coordinates
        : _.isNumber(row[xColumn.value]) && _.isNumber(row[yColumn.value])

const filteredInputData = inputs => inputs.inputData.value.filter(row => validLocation(row, inputs) && filter(row, inputs))

export const remapReferenceData$ = ({inputs, referenceData}) => {
    const referenceData$ = new Subject()
    setTimeout(() => {
        try {
            const counts = {}
            const remapped = referenceData
                .map(({row}) => {
                    const legendValue = parseInt(remap(row, inputs))
                    if (_.isFinite(legendValue)) {
                        counts[legendValue] = (counts[legendValue] || 0) + 1
                    }
                    const {x, y, crs} = getLocation(row, inputs)
                    return {
                        x, y, crs,
                        'class': legendValue
                    }
                })
                .filter(row => _.isFinite(row['class']) && _.isFinite(row.x) && _.isFinite(row.y))
            referenceData$.next({referenceData: remapped, counts})
            referenceData$.complete()
        } catch (e) {
            referenceData$.error(e)
        }
    }, 0)
    return referenceData$
}

export const filterReferenceData$ = ({inputs, recipe}) => {
    const bounds = selectFrom(recipe, 'ui.bounds')
    const bbox = turf.bboxPolygon(bounds.flat())
    const referenceData = filteredInputData(inputs)
        .map(row => {
            const {x, y, crs} = getLocation(row, inputs)
            return {x, y, crs, row}
        })
        .filter(({x, y}) => {
            const point = turf.point([x, y])
            return turf.booleanIntersects(bbox, point)
        })
    return of(referenceData)
}

const remap = (row, inputs) => {
    switch (inputs.classColumnFormat.value) {
    case 'SINGLE_COLUMN':
        return remapSingleColumn(row, inputs)
    case 'MULTIPLE_COLUMNS':
        return remapMultipleColumns(row, inputs)
    case 'OTHER_FORMAT':
        return remapOtherFormat(row, inputs)
    default:
        throw new Error(`Invalid classColumnFormat: ${inputs.classColumnFormat.value}`)
    }
}

const remapSingleColumn = (row, {valueColumn, valueMapping, defaultValue}) => {
    const value = row[valueColumn.value]
    const valuesByLegendValue = valueMapping.value || {}
    const legendValue = Object.keys(valuesByLegendValue)
        .find(legendValue => {
            const values = valuesByLegendValue[legendValue] || []
            return values.includes(value)
        })
    return legendValue === undefined ? defaultValue.value || undefined : legendValue
}

const remapMultipleColumns = (row, {columnMapping, defaultValue}) => {
    const columnsByLegendValue = columnMapping.value
    const legendValue = Object.keys(columnsByLegendValue)
        .find(legendValue => {
            const columns = columnsByLegendValue[legendValue] || []
            return columns.find(column => row[column])
        })
    return legendValue === undefined ? defaultValue.value || undefined : legendValue
}

const remapOtherFormat = (row, {customMapping, defaultValue}) => {
    const expressionByLegendValue = customMapping.value
    const legendValue = Object.keys(expressionByLegendValue)
        .find(legendValue => {
            const expression = expressionByLegendValue[legendValue]
            if (expression === undefined) {
                return false
            } else {
                try {
                    return evaluateRow({row, expression})
                } catch (e) {
                    e.legendValue = legendValue
                    throw e
                }
            }
        })
    return legendValue === undefined ? defaultValue.value || undefined : legendValue
}

const getLocation = (row, {locationType, geoJsonColumn, xColumn, yColumn}) => {
    if (locationType.value === 'GEO_JSON') {
        const geoJson = toGeoJSON(row[geoJsonColumn.value])
        const [x, y] = geoJson.coordinates // TODO: Figure out centroid of polygon
        return {
            x,
            y,
            crs: null
        }
    } else {
        return {
            x: row[xColumn.value],
            y: row[yColumn.value],
            crs: null // TODO: Add CRS input
        }
    }
}

const toGeoJSON = value =>
    _.isString(value)
        ? JSON.parse(value)
        : value
