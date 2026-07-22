import _ from 'lodash'

import ee from '#sepal/ee/ee'

// The single definition of Earth Engine property equality for SEPAL's property-filtering paths (EE Asset
// ImageCollection filters, AOI EE-table key selection, generic EE-table selection, and Feature Layer filtering
// / By-value styling). These share one text-based UI that cannot always know a property's type, while asset
// metadata values are strings and EE feature/image properties may be numeric.
//
// A NON-BLANK string with a finite numeric representation matches both the raw string and that number, so `"8"`
// matches numeric `8` and `"08"` matches both `"08"` and `8`. Non-numeric text ("forest"), blank/whitespace
// strings, `null` and `false` stay a single raw comparison - a blank never silently becomes numeric `0`. A
// value already represented as a number produces ONE exact comparison, never `or(eq(8), eq(8))`.
//
// This is equality only; it must not be generalized to ordered or range filters.
export const propertyEqualityFilter = (property, value) => {
    if (typeof value === 'string' && value.trim() !== '') {
        const numericValue = _.toNumber(value.trim())
        if (_.isFinite(numericValue)) {
            return ee.Filter.or(ee.Filter.eq(property, value), ee.Filter.eq(property, numericValue))
        }
    }
    return ee.Filter.eq(property, value)
}

export const propertyInListFilter = (property, values = []) => {
    const filters = values.map(value => propertyEqualityFilter(property, value))
    if (!filters.length) {
        return ee.Filter.inList(property, [])
    }
    return filters.length === 1 ? filters[0] : ee.Filter.or(...filters)
}
