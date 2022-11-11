import {v4 as uuid} from 'uuid'
import _ from 'lodash'
import hash from 'object-hash'

const HASH_KEY = '___hash___'

let stats = {
    hashedEqual: 0,
    hashedNotEqual: 0,
    notHashed: 0
}

// setInterval(() => {
//     console.log(stats)
// }, 3000)

export const addHash = object => {
    if (_.isPlainObject(object) || _.isArray(object)) {
        Object.defineProperty(object, HASH_KEY, {
            value: uuid(),
            enumerable: false,
            writable: true
        })
    }
}

const copyHash = (source, target) => {
    Object.defineProperty(target, HASH_KEY, {
        value: source[HASH_KEY] || uuid(),
        enumerable: false,
        writable: true
    })
}

export const cloneDeep = entity => {
    const customizer = entity => {
        const isPlainObject = _.isPlainObject(entity)
        const isArray = _.isArray(entity)
        if (isPlainObject || isArray) {
            const cloned = isPlainObject ? {} : []
            for (const prop in entity) {
                cloned[prop] = cloneDeep(entity[prop])
            }
            copyHash(entity, cloned)
            return cloned
        }
    }
    return _.cloneDeepWith(entity, customizer)
}

export const isEqual = (a, b) => {
    return _.isEqualWith(a, b, (a, b) => {
        if (_.isPlainObject(a) && _.isPlainObject(b)) {
            const aHash = a[HASH_KEY]
            if (_.isString(aHash) && !_.isEmpty(aHash)) {
                const bHash = b[HASH_KEY]
                // hash present on both, rely on it
                // aHash === bHash
                //     ? stats.hashedEqual++
                //     : stats.hashedNotEqual++
                return aHash === bHash
            } else {
                stats.notHashed++
            }
        }
        if (_.isArray(a) && _.isArray(b)) {
            const aHash = a[HASH_KEY]
            if (_.isString(aHash) && !_.isEmpty(aHash)) {
                const bHash = b[HASH_KEY]
                // hash present on both, rely on it
                // aHash === bHash
                //     ? stats.hashedEqual++
                //     : stats.hashedNotEqual++
                return aHash === bHash
            } else {
                stats.notHashed++
            }
        }
    })
}
