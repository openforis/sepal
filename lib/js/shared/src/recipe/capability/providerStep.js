import {INHERITED, inheritedSchemaSource, NOT_INHERITED} from '../output/inheritedSchemaSource.js'
import {recipeType} from '../recipeTypeRegistry.js'

// One step from a record towards whatever produces what a capability asks for.
//
// A consumer points at a source; the source is not necessarily the producer. A recipe declaring that it
// preserves an input's schema and values stands for whatever that input produces, so the question is asked
// one record at a time and the answer says what to do next. Only a declared preserving role is followed, so
// a mask, a fill or an AOI can never become the producer, and nothing recognises a recipe type by name.
//
// A capability is a name and the declaration key it asks for. What that declaration MEANS - its terms, what
// evidence confirms it, what a consumer calls a failure - belongs to the capability, not here.
//
// Pure: no React, Redux or Earth Engine.

export const PRODUCES = 'PRODUCES'
export const PRESERVES = 'PRESERVES'
export const UNSUPPORTED = 'UNSUPPORTED'
export const MALFORMED = 'MALFORMED'

//   {status: PRODUCES, declared}    - this record produces it, on the terms it declares
//   {status: PRESERVES, reference}  - whatever this reference produces, this record stands for
//   {status: UNSUPPORTED}           - a terminal recipe that produces nothing of the kind
//   {status: MALFORMED, role}       - a declared preserving role its model does not fill exactly once
export const providerStep = (record, {declaration}) => {
    const declared = recipeType(record?.type)?.[declaration]
    if (declared) {
        return {status: PRODUCES, declared}
    }
    const {status, role, reference} = inheritedSchemaSource(record)
    if (status === INHERITED) {
        return {status: PRESERVES, reference}
    }
    return status === NOT_INHERITED
        ? {status: UNSUPPORTED}
        : {status: MALFORMED, role}
}

// Whether a recipe type could produce it at all - it declares it, or it declares that it preserves an input,
// in which case whether it does depends on what that input turns out to be. Candidate selection only: the
// answer for a particular recipe comes from following its own edges, and what a candidate actually holds is
// the capability's own evidence to establish.
export const mayProvide = (type, {declaration}) =>
    !!recipeType(type)?.[declaration]
    || inheritedSchemaSource({type, model: {}}).role !== undefined
