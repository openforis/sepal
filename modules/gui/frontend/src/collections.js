import _ from 'lodash'

export const arrayEquals = (a1, a2) => {
    if (a1 === a2) return true
    if (((a1 && a1.length) || 0) !== (a2 && a2.length) || 0) return false
    if ((a1 && !a2) || (a2 && !a1)) return false
    return !a1.find((e, i) => e !== a2[i])

}

export const objectEquals = (o1, o2, compareProps) => {
    const extractValues = o =>
        Object.keys(o)
            .filter(key => compareProps.includes(key))
            .map(key => o[key])
    return _.isEqual(extractValues(o1), extractValues(o2))
}

export const equalsIgnoreFunctions = (o1, o2) =>
    _.difference(Object.keys(o1), Object.keys(o2)).length === 0 &&
    _.isEqual(
        _.pickBy(o1, o => !_.isFunction(o)),
        _.pickBy(o2, o => !_.isFunction(o))
    )

export const intersect = array => Array.from(new Set(array))

export const range = (from, to) =>
    [...Array(to - from).keys()].map(i => from + i)
