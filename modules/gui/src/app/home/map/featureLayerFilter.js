import _ from 'lodash'

export const FILTER_BOOLEAN_OPERATORS = ['and', 'or']
export const FILTER_OPERATORS = ['<', '≤', '>', '≥', '=', 'range']

export const resolveFeatureLayerFilter = ({layerConfig} = {}) => {
    const {filter} = layerConfig || {}
    return {
        booleanOperator: FILTER_BOOLEAN_OPERATORS.includes(filter?.booleanOperator)
            ? filter.booleanOperator
            : 'and',
        constraints: Array.isArray(filter?.constraints) ? filter.constraints : []
    }
}

export const isFeatureLayerFilterValid = ({filter, invalidById = {}}) =>
    !Object.values(invalidById).some(Boolean)
        && filter.constraints.every(isConstraintComplete)

const isConstraintComplete = constraint => {
    if (_.isNil(constraint.property) || `${constraint.property}`.trim() === '') {
        return false
    }
    switch (constraint.operator) {
        case '=': return !_.isNil(constraint.value) && `${constraint.value}`.trim() !== ''
        case '<':
        case '≤':
        case '>':
        case '≥': return _.isFinite(constraint.value)
        case 'range': return _.isFinite(constraint.from) && _.isFinite(constraint.to)
        default: return false
    }
}
