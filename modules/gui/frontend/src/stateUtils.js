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

export const resolve = (object, path) =>
    toPathList(path)
        .reduce(({path, value}, part) => {
            if (_.isString(part)) {
                if (_.isArray(value)) {
                    // match array item by index
                    const index = parseInt(part)
                    if (isNaN(index)) {
                        throw new Error('Cannot match array item with non-numeric index.')
                    }
                    return {
                        path: [...path, index],
                        value: value[index]
                    }
                }
                if (_.isPlainObject(value)) {
                    // match object property
                    if (value[part] !== undefined) {
                        return {
                            path: [...path, part],
                            value: value[part]
                        }
                    }
                }
                const index = parseInt(part)
                return {
                    path: path
                        ? [...path, isNaN(index) ? part : index]
                        : undefined,
                    value: undefined
                }

            }
            if (_.isPlainObject(part) && (_.isArray(value) || !value)) {
                // match array item by template
                const index = _.findIndex(value, item => _.isEqual(_.merge({}, item, part), item))
                return index === -1
                    ? {
                        path: [...path, value ? value.length : 0],
                        value: part
                    }
                    : {
                        path: [...path, index],
                        value: value[index]
                    }
            }
            return {
                path: undefined,
                value: undefined
            }
        }, {path: [], value: object})
    
export const selectFrom = (object, path) => resolve(object, path).value
