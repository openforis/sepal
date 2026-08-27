// DO NOT INLINE THIS BACK INTO probabilityPerStratum.js: that would make its six tests impossible to run, and
// they are the only coverage of the area weighting. A `job()` export runs worker plumbing on import and calls
// process.exit, so a test importing that module dies before the first assertion.
//
// Zero area yields 0 rather than NaN, so an empty stratum does not poison the pipeline.
export const toAreaWeightedProportions = groups =>
    (groups || []).map(({stratum, weighted, area}) => ({
        stratum,
        probability: Number(area) > 0 ? Number(weighted) / Number(area) : 0
    }))
