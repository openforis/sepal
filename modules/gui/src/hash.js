import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const HASH_KEY = '___hash___'

const stats = {
    hashedEqual: 0,
    hashedNotEqual: 0,
    notHashed: 0
}

const setHash = (object, hash) =>
    Object.defineProperty(object, HASH_KEY, {
        value: hash,
        enumerable: false,
        writable: true
    })

export const addHash = object =>
    (_.isPlainObject(object) || _.isArray(object)) && setHash(object, uuid())
    
const copyHash = (source, target) =>
    setHash(target, source[HASH_KEY])

export const cloneDeep = entity =>
    _.cloneDeepWith(entity, entity => {
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
    })

export const isEqual = (a, b) =>
    _.isEqualWith(a, b, (a, b) => {
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
