// import _ from 'lodash'
// import hash from 'object-hash'

// export const HASH_KEY = '___hash___'
// export const ARRAY_KEY = '___array___'

// let stats = {
//     equal: 0,
//     notEqual: 0,
//     noHash: 0
// }

// setInterval(() => {
//     console.log(stats)
// }, 3000)

// const deserializer = (key, value) => {
//     if (_.isPlainObject(value)) {
//         const hashValue = value[HASH_KEY]
//         const arrayValue = value[ARRAY_KEY]
//         if (_.isString(hashValue) && _.isArray(arrayValue) && _.keys(value).length === 2) {
//             const array = [...arrayValue]
//             array[HASH_KEY] = hashValue
//             return array
//         }
//     }
//     return value
// }

// const serializer = (key, value) => {
//     const hashValue = value[HASH_KEY]
//     if (_.isString(hashValue) && _.isArray(value)) {
//         const object = {
//             [HASH_KEY]: hashValue,
//             [ARRAY_KEY]: [...value]
//         }
//         return object
//     }
//     return value
// }
  
export const serialize = value => {
    // return JSON.stringify(value, serializer)
    return JSON.stringify(value)
}

export const deserialize = value => {
    // return JSON.parse(value, deserializer)
    return JSON.parse(value)
}

// export const isEqual = (a, b) => {
//     if (_.isPlainObject(a) && _.isPlainObject(b)) {
//         // custom handling for objects
//         const aHash = a[HASH_KEY]
//         const bHash = b[HASH_KEY]
//         if (_.isString(aHash) && _.isString(bHash)) {
//             // hash present on both, rely on it
//             // aHash !== bHash && console.log('object hash equal:', aHash, bHash)
//             stats = {...stats, ...aHash === bHash ? {equal: stats.equal + 1} : {notEqual: stats.notEqual + 1}}
//             return aHash === bHash
//         } else {
//             stats = {...stats, noHash: stats.noHash + 1}
//         }
//         const aKeys = _.keys(a)
//         const bKeys = _.keys(b)
//         if (_.size(aKeys) !== _.size(bKeys)) {
//             // key size doesn't match
//             return false
//         }
//         if (!_.isEqual(aKeys.sort(), bKeys.sort())) {
//             // keys don't match
//             return false
//         }
//         for (const prop in a) {
//             // recursively scan values
//             if (!isEqual(a[prop], b[prop])) {
//                 // non-matching value
//                 return false
//             }
//         }
//         // full match
//         return true
//     }

//     if (_.isArray(a) && _.isArray(b)) {
//         // custom handling for arrays
//         const aHash = a[HASH_KEY]
//         const bHash = b[HASH_KEY]
//         if (_.isString(aHash) && _.isString(bHash)) {
//             // hash present on both, rely on it
//             // aHash !== bHash && console.log('object array equal:', aHash, bHash)
//             stats = {...stats, ...aHash === bHash ? {equal: stats.equal + 1} : {notEqual: stats.notEqual + 1}}
//             return aHash === bHash
//         } else {
//             stats = {...stats, noHash: stats.noHash + 1}
//         }
//         if (_.size(a) !== _.size(b)) {
//             // size doesn't match
//             return false
//         }
//         for (const index in a) {
//             // recursively scan values
//             if (!isEqual(a[index], b[index])) {
//                 // non-matching value
//                 return false
//             }
//         }
//         // full match
//         return true
//     }

//     // default handling for anything else
//     return _.isEqual(a, b)
// }

// export const cloneDeep = value => {
//     if (_.isPlainObject(value)) {
//         // custon handling for objects
//         const clonedObject = {}
//         for (const prop in value) {
//             // recursively clone value
//             clonedObject[prop] = cloneDeep(value[prop])
//         }
//         return clonedObject
//     }

//     if (_.isArray(value)) {
//         // custon handling for arrays
//         const clonedArray = []
//         for (const index in value) {
//             clonedArray[index] = cloneDeep(value[index])
//         }
//         const hash = value[HASH_KEY]
//         if (hash) {
//             // restore non-standard array hash prop on cloned array
//             clonedArray[HASH_KEY] = hash
//         }
//         return clonedArray
//     }

//     // default handling for anything else
//     return _.cloneDeep(value)
// }

// export const getHash = value => {
//     if (_.isPlainObject(value) || _.isArray(value)) {
//         try {
//             return hash(value)
//         } catch (err) {
//             return
//         }
//     }
// }

// export const removeHash = value => {
//     if (_.isPlainObject(value) || _.isArray(value)) {
//         delete value[HASH_KEY]
//     }
// }
