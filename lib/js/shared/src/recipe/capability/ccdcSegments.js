import {INHERITED, inheritedSchemaSource, NOT_INHERITED} from '../output/inheritedSchemaSource.js'
import {recipeType} from '../recipeTypeRegistry.js'

// The CCDC_SEGMENTS capability: which recipe actually produces the segments a source stands for.
//
// A consumer points at a source; the source is not necessarily the producer. A recipe declaring that it
// preserves an input's schema and values stands for whatever that input produces, so the question is asked
// one record at a time and the answer says what to do next. Only a declared preserving role is followed, so
// a mask, a fill or an AOI can never become the producer, and nothing recognises a recipe type by name.
//
// Pure: no React, Redux or Earth Engine. Consumers that hold records walk this themselves; consumers that
// must load them walk it as they load.

export const CCDC_SEGMENTS = 'CCDC_SEGMENTS'

export const PRODUCES = 'PRODUCES'
export const PRESERVES = 'PRESERVES'
export const UNSUPPORTED_SEGMENT_SOURCE = 'UNSUPPORTED_SEGMENT_SOURCE'
export const MALFORMED_SEGMENT_SOURCE = 'MALFORMED_SEGMENT_SOURCE'

// One step from a record towards the producer of its segments.
//
//   {status: PRODUCES, declared}    - this record produces them, on the terms it declares
//   {status: PRESERVES, reference}  - whatever this reference produces, this record stands for
//   {status: UNSUPPORTED_SEGMENT_SOURCE} - a terminal recipe that produces no segments
//   {status: MALFORMED_SEGMENT_SOURCE}   - a declared preserving role its model does not fill exactly once
export const segmentProviderStep = record => {
    const declared = recipeType(record?.type)?.segmentSource
    if (declared) {
        return {status: PRODUCES, declared}
    }
    const {status, role, reference} = inheritedSchemaSource(record)
    if (status === INHERITED) {
        return {status: PRESERVES, reference}
    }
    return status === NOT_INHERITED
        ? {status: UNSUPPORTED_SEGMENT_SOURCE}
        : {status: MALFORMED_SEGMENT_SOURCE, role}
}

// Whether a recipe type could produce segments at all - it declares them, or it declares that it preserves
// an input, in which case whether it does depends on what that input turns out to be. Candidate selection
// only: the answer for a particular recipe comes from following its own edges.
export const mayProvideSegments = type =>
    !!recipeType(type)?.segmentSource
    || inheritedSchemaSource({type, model: {}}).role !== undefined
