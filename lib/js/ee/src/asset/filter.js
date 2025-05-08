const ee = require('#sepal/ee/ee')

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
    '=': ({property, value}) => ee.Filter.eq(property, value),
    'range': ({property, from, fromInclusive, to, toInclusive}) => ee.Filter.and(
        fromInclusive
            ? ee.Filter.gte(property, from)
            : ee.Filter.gt(property, from),
        toInclusive
            ? ee.Filter.lte(property, to)
            : ee.Filter.lt(property, to)
    )
}

module.exports = {createFilter}
