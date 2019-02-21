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

export const selectFrom = (object, path) =>
    toPathList(path).reduce((subObject, part) => {
        return subObject != null && subObject[part] != null ? subObject[part] : undefined
    }, object)

const dotSafeUnwrap = safePath => safePath.dotSafe

const dotSafeWrap = path => ({dotSafe: path})

export const toPathList = (path, safe = false) => {
    if (_.isArray(path)) {
        return _.chain(path)
            .map(pathElement => toPathList(pathElement, safe))
            .filter(_.identity)
            .flatten()
            .value()
    }
    if (_.isObject(path)) {
        return toPathList(dotSafeUnwrap(path), true)
    }
    if (_.isString(path)) {
        return safe ? path : path.split('.')
    }
    if (_.isNumber(path)) {
        return path.toString()
    }
    if (_.isUndefined(path)) {
        return null
    }
    if (_.isNull(path)) {
        return null
    }
    throw new Error(`Unsupported path element type: '${path}'`)
}

export const dotSafe = dotSafeWrap
