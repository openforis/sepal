import _ from 'lodash'

export const FILTER_BOOLEAN_OPERATORS = ['and', 'or']
export const FILTER_OPERATORS = ['<', '≤', '>', '≥', '=', 'class', 'range']

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

export const newFeatureLayerConstraint = ({id, columns = [], filter, style, categoriesByProperty = {}}) => {
    const byValueProperty = !filter.constraints.length
        && style.colorMode === 'COLORS_BY_VALUE'
        && columns.includes(style.valueProperty)
        ? style.valueProperty
        : null
    const property = byValueProperty || (columns.length === 1 ? columns[0] : null)
    const categories = property && categoriesByProperty[property]
    return {
        id,
        image: 'feature-layer',
        property,
        operator: categories && categories.length ? 'class' : '=',
        selectedClasses: []
    }
}

const isConstraintComplete = constraint => {
    if (_.isNil(constraint.property) || `${constraint.property}`.trim() === '') {
        return false
    }
    switch (constraint.operator) {
        case '=': return !_.isNil(constraint.value) && `${constraint.value}`.trim() !== ''
        case 'class': return Array.isArray(constraint.selectedClasses) && constraint.selectedClasses.length > 0
        case '<':
        case '≤':
        case '>':
        case '≥': return _.isFinite(constraint.value)
        case 'range': return _.isFinite(constraint.from) && _.isFinite(constraint.to)
        default: return false
    }
}
