import _ from 'lodash'

import ee from '#sepal/ee/ee'

// Property equality that tolerates the string/number ambiguity of the text-based property-equality UI (the EE
// Asset ImageCollection filter and the Feature Layer filter both capture the value as free text, and asset
// metadata values are strings while EE feature/image properties may be numeric). A NON-BLANK string with a
// finite numeric representation matches both the raw string and that number, so `"8"` matches numeric `8` and
// `"08"` matches both `"08"` and `8`; non-numeric text ("forest") and blank/whitespace strings stay a single
// string comparison (so a blank never silently becomes numeric `0`). A value that is already a number uses one
// exact comparison rather than a redundant `or(eq(8), eq(8))`. Shared by createFilter, filterTable and the
// table-map By-value styling.
const equalityFilter = (property, value) => {
    if (typeof value === 'string' && value.trim() !== '') {
        const numericValue = _.toNumber(value.trim())
        if (_.isFinite(numericValue)) {
            return ee.Filter.or(ee.Filter.eq(property, value), ee.Filter.eq(property, numericValue))
        }
    }
    return ee.Filter.eq(property, value)
}

const createFilter = filtersEntries =>
    ee.Filter.and(...filtersEntries.map(createEntryFilter))

const createEntryFilter = ({constraints, booleanOperator}) => {
    const constraintsFilters = createConstraintsFilters(constraints)
    return booleanOperator === 'and'
        ? ee.Filter.and(...constraintsFilters)
        : ee.Filter.or(...constraintsFilters)
}

const createConstraintsFilters = constraints =>
    constraints.map(createConstraintFilter)

const createConstraintFilter = constraint => {
    const strategy = strategies[constraint.operator]
    if (!strategy) {
        throw Error(`Unsupported constraint: ${constraint}`)
    } else {
        return strategy(constraint, constraint.property)
    }
}

const strategies = {
    '<': ({property, value}) => ee.Filter.lt(property, value),
    '≤': ({property, value}) => ee.Filter.lte(property, value),
    '>': ({property, value}) => ee.Filter.gt(property, value),
    '≥': ({property, value}) => ee.Filter.gte(property, value),
    '=': ({property, value}) => equalityFilter(property, value),
    'range': ({property, from, fromInclusive, to, toInclusive}) => ee.Filter.and(
        fromInclusive
            ? ee.Filter.gte(property, from)
            : ee.Filter.gt(property, from),
        toInclusive
            ? ee.Filter.lte(property, to)
            : ee.Filter.lt(property, to)
    )
}

export {createFilter, equalityFilter}
