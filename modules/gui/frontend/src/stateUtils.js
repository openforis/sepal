import _ from 'lodash'

const DOT_SAFE = '__dotSafe__'
const dotSafeWrap = unsafePath => ({[DOT_SAFE]: unsafePath})
const dotSafeUnwrap = safePath => safePath[DOT_SAFE]

export const dotSafe = dotSafeWrap

export const toPathList = (path, safe = false) => {
    if (_.isArray(path)) {
        return _.chain(path)
            .map(pathElement => toPathList(pathElement, safe))
            .filter(_.identity)
            .flatten()
            .value()
    }
    if (_.isObject(path)) {
        const unwrapped = dotSafeUnwrap(path)
        return _.isUndefined(unwrapped)
            ? path
            : toPathList([unwrapped], true)
    }
    if (_.isString(path)) {
        return safe ? [path] : path.split('.')
    }
    if (_.isNumber(path)) {
        return [path.toString()]
    }
    if (_.isUndefined(path)) {
        return null
    }
    if (_.isNull(path)) {
        return null
    }
    throw new Error(`Unsupported path element type: '${path}'`)
}

export const resolve = (object, path, createTemplates = false) =>
    toPathList(path)
        .reduce((value, pathElement, _index, pathElements) => {
            if (_.isString(pathElement)) {
                if (_.isArray(value)) {
                    // match array item by index
                    const index = parseInt(pathElement)
                    if (isNaN(index)) {
                        throw new Error('Cannot match array item with non-numeric index.')
                    }
                    return value[index]
                }
                if (_.isObjectLike(value)) {
                    // match object property
                    if (value[pathElement] !== undefined) {
                        return value[pathElement]
                    }
                }
            }
            if (_.isPlainObject(pathElement) && _.isArray(value)) {
                // match array item by template
                const item = _.find(value,
                    item => _.isEqual(_.merge({}, item, pathElement), item)
                )
                if (item) {
                    return item
                }
                if (createTemplates) {
                    return pathElement
                }
            }
            pathElements.splice(1) // break out of reduce
            return undefined
        }, object)

// export const resolve = (object, pathToResolve, createTemplates = false) =>
//     toPathList(pathToResolve)
//         .reduce(({path, value}, part) => {
//             if (_.isString(part)) {
//                 if (_.isArray(value)) {
//                     // match array item by index
//                     const index = parseInt(part)
//                     if (isNaN(index)) {
//                         throw new Error('Cannot match array item with non-numeric index.')
//                     }
//                     return {
//                         path: [...path, index],
//                         value: value[index]
//                     }
//                 }
//                 if (_.isPlainObject(value)) {
//                     // match object property
//                     if (value[part] !== undefined) {
//                         return {
//                             path: [...path, part],
//                             value: value[part]
//                         }
//                     }
//                 }
//                 const index = parseInt(part)
//                 if (!path) {
//                     console.error('Invalid path', {pathToResolve, object})
//                     throw new Error('Invalid path')
//                 }
//                 return {
//                     path: [...path, isNaN(index) ? part : index],
//                     value: undefined
//                 }
//             }
//             if (_.isPlainObject(part) && (_.isArray(value) || !value)) {
//                 // match array item by template
//                 const index = _.findIndex(value, item => _.isEqual(_.merge({}, item, part), item))
//                 return index === -1
//                     ? {
//                         path: [...path, value ? value.length : 0],
//                         value: createTemplates ? part : undefined
//                     }
//                     : {
//                         path: [...path, index],
//                         value: value[index]
//                     }
//             }
//             return {
//                 path: undefined,
//                 value: undefined
//             }
//         }, {path: [], value: object}).value

export const selectFrom = (object, path) => resolve(object, path)

export class Mutator {
    constructor(state, path) {
        this.state = {
            root: state
        }
        this.path = toPathList(['root', path])
    }

    getKey(pathState, pathElement) {
        if (_.isPlainObject(pathElement)) {
            return _.findIndex(pathState, item => _.isEqual(_.merge({}, item, pathElement), item))
        }
        return pathElement
    }

    getNext(next, index) {
        const isPositiveInt = str => {
            var n = Math.floor(Number(str))
            return n !== Infinity && String(n) === str && n >= 0
        }
        if (next === undefined) {
            const nextPathElement = this.path[index + 1]
            const isArray = v => (_.isString(v) && isPositiveInt(v)) || _.isPlainObject(v)
            return isArray(nextPathElement) ? [] : {}
        } else {
            return _.clone(next || {})
        }
    }

    mutate(func) {
        const parentPath = _.initial(this.path)
        const pathElement = _.last(this.path)
        const stateElements = _.chain(parentPath)
            .transform(
                (stateElements, pathElement, index, pathElements) => {
                    const stateElement = _.last(stateElements)
                    const key = this.getKey(stateElement, pathElement)
                    if (key === -1) {
                        const next = _.clone(pathElement)
                        if (stateElement) {
                            // add to array
                            stateElement.push(next)
                        } else {
                            // create array
                            const previousElement = _.nth(stateElements, -2)
                            previousElement[pathElements[index - 1]] = [next]
                        }
                        stateElements.push(next)
                    } else {
                        const next = this.getNext(stateElement[key], index)
                        stateElement[key] = next
                        stateElements.push(next)
                    }
                }, [this.state])
            .tail() // drop the synthetic root
            .value()
        const state = _.first(stateElements)
        const pathState = _.last(stateElements)
        const key = this.getKey(pathState, pathElement)
        const pathKey = key === -1
            ? pathState.length
            : key
        func(pathState, pathKey)
        return state
    }

    set(value) {
        return this.mutate((pathState, pathKey) => {
            pathState[pathKey] = _.cloneDeep(value)
        })
    }

    sort(key) {
        return this.mutate((pathState, pathKey) => {
            pathState[pathKey] = _.orderBy(pathState[pathKey], key)
        })
    }

    unique() {
        return this.mutate((pathState, pathKey) => {
            pathState[pathKey] = _.uniq(pathState[pathKey])
        })
    }

    assign(value) {
        return this.mutate((pathState, pathKey) => {
            pathState[pathKey] = _.cloneDeep(_.assign({}, pathState[pathKey], value))
        })
    }

    merge(value) {
        return this.mutate((pathState, pathKey) => {
            pathState[pathKey] = _.cloneDeep(_.merge({}, pathState[pathKey], value))
        })
    }

    push(value) {
        return this.mutate((pathState, pathKey) => {
            if (!pathState[pathKey]) {
                pathState[pathKey] = []
            }
            pathState[pathKey].push(_.cloneDeep(value))
        })
    }

    pushUnique(value, key) {
        return this.mutate((pathState, pathKey) => {
            const finder = key
                ? item => resolve(item, key, true) === resolve(value, key, true)
                : item => item === value
            const array = pathState[pathKey]
            if (!array || !_.find(array, finder)) {
                if (!array) {
                    pathState[pathKey] = []
                }
                pathState[pathKey].push(_.cloneDeep(value))
            }
        })
    }

    del() {
        return this.mutate((pathState, pathKey) => {
            if (_.isPlainObject(pathState)) {
                delete pathState[pathKey]
            } else if (_.isArray(pathState)) {
                pathState.splice(pathKey, 1)
            } else {
                console.error('Unsupported type to delete from', {pathState, pathKey})
                throw new Error('Unsupported type to delete from')
            }
        })
    }
}
