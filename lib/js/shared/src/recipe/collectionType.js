// Which collection a `sources` submodel describes.
//
// One decision, shared by the code that BUILDS the collection (lib/js/ee/src/timeSeries/collection.js) and by
// the code that declares what that collection depends on. Duplicating the conditions would let the two drift,
// and the drift would be silent: a dependency graph would claim sources execution never reads, or miss ones
// it does.
//
// The branch is derived from `sources.dataSets`, not from the persisted `sources.dataSetType`. That is what
// execution does, and a persisted type field can disagree with the data sets actually selected.
//
// For any valid persisted data-set object this reproduces the previous branch decision exactly. Planet is the
// FALLBACK rather than a named case: anything that is neither exactly Sentinel-1 nor carrying an optical
// data-set key lands there.
//
// Missing or empty data sets are tolerated for DEPENDENCY EXTRACTION, which must be able to describe a
// half-written recipe without throwing. That tolerance says nothing about whether the recipe can run: this
// classifier does not validate the resulting collection, and planetImages will still fail on a model with no
// data sets when it reads them. Answering "which sources would be read" is not the same as answering
// "would this execute".

export const RADAR = 'RADAR'
export const OPTICAL = 'OPTICAL'
export const PLANET = 'PLANET'

const OPTICAL_DATA_SETS = ['LANDSAT', 'SENTINEL_2']

const isRadar = dataSets => {
    const selected = Object.values(dataSets).flat()
    return selected.length === 1 && selected[0] === 'SENTINEL_1'
}

const isOptical = dataSets =>
    Object.keys(dataSets).some(dataSet => OPTICAL_DATA_SETS.includes(dataSet))

export const collectionType = dataSets => {
    const selected = dataSets || {}
    if (isRadar(selected)) {
        return RADAR
    }
    return isOptical(selected) ? OPTICAL : PLANET
}
