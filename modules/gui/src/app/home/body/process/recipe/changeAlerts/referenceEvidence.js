import {selectFrom} from '~/stateUtils'

import {OBSERVED, sourceKeyOf, UNAVAILABLE, UNOBSERVED} from '../sourceEvidence'

// What Change Alerts knows about the segments it monitors against.
//
// The description is the source's, held in runtime state by the shared evidence lifecycle. What the recipe
// holds is the SELECTION - the reference it executes - and, in recipes saved by an older GUI, a copy of the
// description taken when that selection was made. The copy is the fallback while nothing has been observed,
// and never the answer once something has.

export const selectedReference = recipe => {
    const {type, id} = selectFrom(recipe, 'model.reference') || {}
    return type && id ? {type, id} : null
}

export const segmentDescription = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    const key = sourceKeyOf(selectedReference(recipe))
    if (key && evidence?.sourceKey === key) {
        return evidence.status === OBSERVED
            ? {status: OBSERVED, description: evidence.segments}
            : {status: UNAVAILABLE, description: null}
    }
    const copied = selectFrom(recipe, 'model.reference') || {}
    return copied.bands || copied.baseBands
        ? {status: UNOBSERVED, description: copiedDescription(copied)}
        : {status: UNOBSERVED, description: null}
}

// Whether there is a description to present at all. An operation over a source nothing can be said about
// is not offered, however much configuration the recipe carries.
export const hasSegmentDescription = recipe =>
    !!segmentDescription(recipe).description

// An O(1) identity for the description being presented: it changes when another observation is accepted for
// the selected source, and that is when anything derived from the previous one has to be discarded.
export const segmentDescriptionGeneration = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    const key = sourceKeyOf(selectedReference(recipe))
    return key && evidence?.sourceKey === key ? evidence.observation ?? null : null
}

export const segmentBandsOf = recipe =>
    segmentDescription(recipe).description?.bands || []

export const baseBandsOf = recipe =>
    segmentDescription(recipe).description?.baseBands || []

export const segmentDatesOf = recipe => {
    const {description} = segmentDescription(recipe)
    return {startDate: description?.startDate, endDate: description?.endDate}
}

export const segmentVisualizations = recipe =>
    segmentDescription(recipe).description?.visualizations || []

// The representation the pixel chart interprets segment times in. An asset source's configured value is the
// user's and wins over anything read from metadata, zero included; otherwise the producer's own.
export const dateFormatOf = recipe => {
    const {type, dateFormat: configured} = selectFrom(recipe, 'model.reference') || {}
    if (type === 'ASSET' && isSet(configured)) {
        return configured
    }
    const described = segmentDescription(recipe).description?.dateFormat
    return isSet(described) ? described : configured
}

const isSet = value => value !== undefined && value !== null

// A copy an older GUI saved spelled the measures of a base band `bandTypes`. Normalized here, at the one
// boundary a legacy shape enters, so every consumer reads one shape.
const copiedDescription = ({bands, baseBands, segmentBands, dateFormat, startDate, endDate, visualizations}) => ({
    bands: bands || [],
    baseBands: (baseBands || []).map(({name, measures, bandTypes}) => ({
        name,
        measures: measures || bandTypes || []
    })),
    segmentBands: segmentBands || [],
    dateFormat,
    startDate,
    endDate,
    visualizations: visualizations || []
})
