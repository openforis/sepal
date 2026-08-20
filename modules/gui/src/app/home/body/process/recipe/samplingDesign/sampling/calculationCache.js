import _ from 'lodash'

// Successful raw Earth Engine results, keyed by the semantic request that produced them. Recalculating the
// same thing after wandering through other sources is common enough - and expensive enough, up to a batch
// task - that the second answer should be free.
//
// The AOI is the cache SCOPE rather than part of every key: it is potentially large, it is the same for every
// entry, and an AOI change does not make old entries slower answers to the same question - it makes them
// answers to a different one. So a different AOI empties the cache rather than partitioning it, and coming
// back to the old AOI does not bring the old answers back.
//
// Nothing here is persisted, observed or rendered from. Only successful raw responses are ever stored: an
// error is not a result, and an in-flight observable is not one yet.
export const calculationCache = () => {
    let scope
    let entries = []

    // Cloned so the caller's later edits to the AOI it passed cannot silently redefine what the stored
    // entries were computed over.
    const enterScope = aoi => {
        if (!_.isEqual(scope, aoi)) {
            scope = _.cloneDeep(aoi)
            entries = []
        }
    }

    // Structural, because a key is rebuilt from form values on every request and would never match by
    // identity. No size bound: the owning recipe tab's lifetime is the bound.
    const indexOf = key => entries.findIndex(entry => _.isEqual(entry.key, key))

    return {
        get: ({aoi, key}) => {
            enterScope(aoi)
            const index = indexOf(key)
            return index < 0 ? undefined : _.cloneDeep(entries[index].result)
        },

        set: ({aoi, key, result}) => {
            enterScope(aoi)
            // Cloned in both directions: the caller keeps a reference to the key it built and to the result
            // it was handed, and ordinary downstream work on either must not be able to rewrite cache
            // identity or corrupt a stored answer.
            const entry = {key: _.cloneDeep(key), result: _.cloneDeep(result)}
            const index = indexOf(key)
            if (index < 0) {
                entries.push(entry)
            } else {
                entries[index] = entry
            }
        }
    }
}
