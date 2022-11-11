import _ from 'lodash'
import hash from 'object-hash'

const HASH_KEY = '___hash___'

let stats = {
    equal: 0,
    notEqual: 0,
    noHash: 0
}

setInterval(() => {
    console.log(stats)
}, 3000)

const getHashCode = object => {
    try {
        return hash(object)
    } catch (error) {
        // console.log('Cannot hash', object)
    }
}

export const addHash = object => {
    if (_.isPlainObject(object) || _.isArray(object)) {
        Object.defineProperty(object, HASH_KEY, {
            value: getHashCode(object),
            enumerable: false,
            writable: true
        })
    }
}

const copyHash = (source, target) => {
    if (_.isPlainObject(source) || _.isArray(source)) {
        Object.defineProperty(target, HASH_KEY, {
            value: source[HASH_KEY],
            enumerable: false,
            writable: true
        })
    }
}

export const cloneDeep = entity => {
    if (_.isPlainObject(entity)) {
        // custon handling for objects
        const cloned = {}
        copyHash(entity, cloned)
        for (const prop in entity) {
            cloned[prop] = cloneDeep(entity[prop])
        }
        return cloned
    }

    if (_.isArray(entity)) {
        // custon handling for arrays
        const cloned = []
        copyHash(entity, cloned)
        for (const index in entity) {
            cloned[index] = cloneDeep(entity[index])
        }
        return cloned
    }

    // default handling for anything else
    return _.cloneDeep(entity)
}

export const isEqual = (a, b) => {
    if (_.isPlainObject(a) && _.isPlainObject(b)) {
        // custom handling for objects
        const aHash = a[HASH_KEY]
        if (_.isString(aHash) && !_.isEmpty(aHash)) {
            const bHash = b[HASH_KEY]
            // hash present on both, rely on it
            stats = {...stats, ...aHash === bHash ? {equal: stats.equal + 1} : {notEqual: stats.notEqual + 1}}
            return aHash === bHash
        } else {
            stats = {...stats, noHash: stats.noHash + 1}
        }
        const aKeys = _.keys(a)
        const bKeys = _.keys(b)
        if (_.size(aKeys) !== _.size(bKeys)) {
            // key size doesn't match
            return false
        }
        if (!_.isEqual(aKeys.sort(), bKeys.sort())) {
            // keys don't match
            return false
        }
        for (const prop in a) {
            // recursively scan values
            if (!isEqual(a[prop], b[prop])) {
                // non-matching value
                return false
            }
        }
        // full match
        return true
    }

    if (_.isArray(a) && _.isArray(b)) {
        // custom handling for arrays
        const aHash = a[HASH_KEY]
        if (_.isString(aHash) && !_.isEmpty(aHash)) {
            const bHash = b[HASH_KEY]
            // hash present on both, rely on it
            stats = {...stats, ...aHash === bHash ? {equal: stats.equal + 1} : {notEqual: stats.notEqual + 1}}
            return aHash === bHash
        } else {
            stats = {...stats, noHash: stats.noHash + 1}
        }
        if (_.size(a) !== _.size(b)) {
            // size doesn't match
            return false
        }
        for (const index in a) {
            // recursively scan values
            if (!isEqual(a[index], b[index])) {
                // non-matching value
                return false
            }
        }
        // full match
        return true
    }

    // default handling for anything else
    return _.isEqual(a, b)
}
