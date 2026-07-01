import {map} from 'rxjs'

import ee from '#sepal/ee/ee'

// Per-stratum sample counts of a collection, as a plain {stratumValue: count} object (keys stringified).
// `description` labels the getInfo call in the logs so the different counting passes are distinguishable
// (raw candidate count vs final validation count).
export const getSampleCounts$ = (collection, description = 'sample counts per stratum') =>
    ee.getInfo$(
        ee.Dictionary(collection.aggregate_histogram('stratum')),
        description
    )

// Pure comparison of counts to the requested allocation. Returns the shortfall rows.
// requireFull=true  -> a stratum is short when it has fewer than requested.
// requireFull=false -> a stratum is short only when it is empty (CLOSEST may intentionally undershoot).
export const findShortfalls = (counts, allocation, {requireFull = true} = {}) =>
    allocation
        .map(stratum => ({
            stratum: stratum.stratum,
            label: stratum.label,
            requested: Number(stratum.sampleSize),
            actual: (counts && counts[String(stratum.stratum)]) || 0
        }))
        .filter(({requested, actual}) => requireFull ? actual < requested : actual <= 0)

export const shortfallMessage = shortfalls =>
    `Sampling produced fewer samples than requested (${
        shortfalls
            .map(({label, stratum, requested, actual}) => `${label || `stratum ${stratum}`}: ${actual}/${requested}`)
            .join('; ')
    }). Reduce the minimum distance or sample size, or enlarge the area of interest.`

// Final safety guard: throws a clear task error if the collection under-produces. Exporters retry with
// denser internal parameters first; this only fires when retries can't satisfy the request.
export const validateSampleCounts$ = (collection, allocation, {requireFull = true} = {}) =>
    getSampleCounts$(collection, 'final validation count').pipe(
        map(counts => {
            const shortfalls = findShortfalls(counts, allocation, {requireFull})
            if (shortfalls.length) {
                throw new Error(shortfallMessage(shortfalls))
            }
            return counts
        })
    )
