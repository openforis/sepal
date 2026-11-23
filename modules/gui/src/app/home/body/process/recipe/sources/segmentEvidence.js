import _ from 'lodash'

import {OBSERVED, sourceEdgeOf, sourceKeyOf, UNAVAILABLE, UNOBSERVED} from './sourceEvidence'

// What a consumer of CCDC segments knows about the segments the source it selects in a role supplies.
//
// The description is the source's, held in runtime state by the shared evidence lifecycle (`segments`, as SEGMENTS
// reads it, segmentCapability.js). What the recipe holds is the selection - the reference it executes - and, in recipes
// saved by an older GUI, a copy of the description taken when that selection was made. The copy is the fallback while
// nothing has been observed, and never the answer once something has: evidence that could not be had leaves the
// recipe with nothing rather than with a description of the source as it once was.
//
// `resolved`, where given, is a description the caller already holds - a consumer resolving the recipe as a
// dependency, which has no runtime evidence of its own - and is the answer.

export const segmentDescription = (recipe, role, resolved) => {
    if (resolved) {
        return {status: OBSERVED, description: resolved}
    }
    const edge = sourceEdgeOf(recipe, role)
    const evidence = recipe?.ui?.sourceEvidence
    if (edge && evidence?.sourceKey === sourceKeyOf(edge.reference)) {
        return evidence.status === OBSERVED
            ? {status: OBSERVED, description: evidence.segments}
            : {status: UNAVAILABLE, description: null}
    }
    const copied = selectionOf(recipe, edge)
    return copied.bands || copied.baseBands
        ? {status: UNOBSERVED, description: copiedDescription(copied)}
        : {status: UNOBSERVED, description: null}
}

export const baseBandsOf = (recipe, role, resolved) =>
    segmentDescription(recipe, role, resolved).description?.baseBands || []

export const segmentDatesOf = (recipe, role, resolved) => {
    const {description} = segmentDescription(recipe, role, resolved)
    return {startDate: description?.startDate, endDate: description?.endDate}
}

// The representation segment times are interpreted in. An asset source's configured value is the user's - the metadata
// prefilled it, and the user may have corrected it - and wins over anything read, zero included; otherwise the
// source's own, then what was saved beside the selection. Where nothing says, the consumer decides.
export const dateFormatOf = (recipe, role, resolved) => {
    const {type, dateFormat: configured} = selectionOf(recipe, sourceEdgeOf(recipe, role))
    if (type === 'ASSET' && isSet(configured)) {
        return configured
    }
    const described = segmentDescription(recipe, role, resolved).description?.dateFormat
    return isSet(described) ? described : configured
}

const isSet = value => value !== undefined && value !== null

// What the recipe stores for the selection, beside the reference: empty where the role selects nothing it can read.
const selectionOf = (recipe, edge) =>
    (edge && _.get(recipe, edge.path)) || {}

// A copy an older GUI saved spelled the measures of a base band `bandTypes`. Normalized here, at the one boundary a
// legacy shape enters, so every consumer reads one shape.
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
