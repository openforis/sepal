import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const HASH_KEY = '___hash___'

// const stats = {}

// const resetStats = () => {
//     stats.hashComparisons = 0,
//     stats.valueComparisons = 0
// }

// resetStats()

// setInterval(() => {
//     const total = stats.hashComparisons + stats.valueComparisons
//     if (total) {
//         console.log(`bypassed ${Math.round(100 * stats.hashComparisons / total)}% of ${total} equality checks`)
//         resetStats()
//     }
// }, 1000)

export const createHash = () =>
    uuid()

const setHash = (object, hash) =>
    Object.defineProperty(object, HASH_KEY, {
        value: hash,
        enumerable: false,
        writable: true
    })

export const getHash = object =>
    object && object[HASH_KEY]

export const addHash = (object, hash = createHash()) => {
    if (_.isPlainObject(object) || _.isArray(object)) {
        setHash(object, hash)
    }
}

export const cloneDeep = entity =>
    _.cloneDeepWith(entity, entity => {
        const isPlainObject = _.isPlainObject(entity)
        const isArray = _.isArray(entity)
        if (isPlainObject || isArray) {
            const cloned = isPlainObject ? {} : []
            for (const prop in entity) {
                cloned[prop] = cloneDeep(entity[prop])
            }
            const hash = getHash(entity)
            hash && setHash(cloned, hash)
            return cloned
        }
    })

export const isEqual = (a, b) =>
    _.isEqualWith(a, b, (a, b) => {
        if (a instanceof Function && b instanceof Function) {
            return true
        }
        if (_.isPlainObject(a) && _.isPlainObject(b) || _.isArray(a) && _.isArray(b)) {
            const aHash = getHash(a)
            if (!_.isEmpty(aHash)) {
                // stats.hashComparisons++
                const bHash = getHash(b)
                return aHash === bHash
            } else {
                // stats.valueComparisons++
            }
        }
    })

export const isPartiallyEqual = (a, b, props) =>
    _.isEqual(_.pick(a, props), _.pick(b, props))
