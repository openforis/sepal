// Which bands a Planet collection carries, by the names its processing renames them to.
//
// One authority, read both by the Earth Engine code that performs those renames
// (lib/js/ee/src/planet/daily.js, basemap.js and histogramMatch.js) and by anything that must declare what a
// configured Planet collection makes available. Duplicating the names would let a declaration advertise bands
// the collection does not carry, or hide ones it does.
//
// A rename table is not a catalogue. Planet Daily is a MERGE of branches - four-band imagery with either
// quality product, and eight-band PSB.SD imagery - and merging a branch no imagery matched cannot give the
// imagery that did match bands it never carried. So what a configured collection makes available depends on
// the imagery contributing to it, and on the processing applied: histogram matching returns the four bands it
// matches whatever it was given (lib/js/ee/src/histogramMatch.js).

export const PLANET_BASEMAP_BANDS = ['B', 'G', 'R', 'N']

export const PLANET_DAILY_4_BANDS = ['B1', 'B2', 'B3', 'B4']

export const PLANET_DAILY_8_BANDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']

export const BASEMAP_BAND_NAMES = ['blue', 'green', 'red', 'nir']

export const DAILY_4_BAND_NAMES = ['blue', 'green', 'red', 'nir']

export const DAILY_8_BAND_NAMES = ['aerosol', 'blue', 'green1', 'green', 'yellow', 'red', 'redEdge', 'nir']

export const HISTOGRAM_MATCHED_BAND_NAMES = ['blue', 'green', 'red', 'nir']

// What a configured collection carries:
//
//   source             the persisted collection type, as the sources panel stores it and
//                      lib/js/ee/src/planet/collection.js branches on it - anything that is not Daily is read
//                      as a basemap, a custom asset list included
//   histogramMatching  the processing option, applied only on the Daily branch
//   nativeBands        the band names EVERY contributing image carries, where a caller could read them.
//                      lib/js/ee/src/planet/daily.js reads them from the imagery execution would process -
//                      the configured assets merged and filtered by area and dates - rather than from
//                      whatever an asset happens to begin with. An EMPTY list is the answer of a caller that
//                      looked and found no contributing imagery; `undefined` says nothing was read
//
// Without the contributing imagery's band names, only what EVERY Daily image carries can be stated: claiming
// the eight-band naming for a four-band collection would offer an export that cannot run.
export const planetBandNames = ({source, histogramMatching, nativeBands} = {}) => {
    if (source !== 'DAILY') {
        return BASEMAP_BAND_NAMES
    }
    // No imagery contributes, so the collection carries nothing - not the four every Daily image would have
    // carried had there been any, and nothing for processing to narrow.
    if (carriesNothing(nativeBands)) {
        return []
    }
    if (histogramMatching === 'ENABLED') {
        return HISTOGRAM_MATCHED_BAND_NAMES
    }
    return carriesEvery(nativeBands, PLANET_DAILY_8_BANDS)
        ? DAILY_8_BAND_NAMES
        : DAILY_4_BAND_NAMES
}

const carriesNothing = nativeBands => Array.isArray(nativeBands) && !nativeBands.length

const carriesEvery = (nativeBands, required) =>
    Array.isArray(nativeBands) && required.every(band => nativeBands.includes(band))
