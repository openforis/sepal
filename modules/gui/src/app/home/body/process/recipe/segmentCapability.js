import {throwError} from 'rxjs'

import {
    CCDC_SEGMENTS,
    MALFORMED_SEGMENT_SOURCE,
    UNSUPPORTED_SEGMENT_SOURCE
} from '#sepal/recipe/capability/ccdcSegments'

import {getRecipeType} from '../recipeTypeRegistry'
import {describeSegmentsAsset$} from './ccdc/segmentsAsset'
import {NOT_A_SOURCE, resolveProvider, UNRESOLVED, UNSUPPORTED} from './sourceProvider'

// The GUI's side of the CCDC_SEGMENTS capability: it acquires evidence, the shared rule decides where from.
//
// A consumer names the source it selected. That source is not necessarily the producer - a Masking over CCDC
// stands for CCDC's segments - so the shared rule is walked over the records the closure already resolved,
// and the producer it arrives at is asked to describe itself through the provider its own type registers.

export const UNRESOLVED_SEGMENT_SOURCE = 'UNRESOLVED_SEGMENT_SOURCE'

export class SegmentSourceError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'SegmentSourceError'
        this.code = code
    }
}

export const describeSegmentSource$ = (reference, {graph, recipesById}) => {
    const producer = resolveSegmentProducer(reference, recipesById)
    return producer.error
        ? throwError(() => producer.error)
        : describeProducer$(producer, {graph, recipesById})
}

export const describeProducer$ = (producer, {graph, recipesById}) => {
    if (producer.assetId !== undefined) {
        return describeSegmentsAsset$(producer.assetId)
    }
    const describe$ = getRecipeType(producer.record.type)?.describeSegments$
    return describe$
        ? describe$({recipe: producer.record, graph, recipesById})
        : throwError(() => new SegmentSourceError(
            UNSUPPORTED_SEGMENT_SOURCE,
            `A ${producer.record.type} recipe does not describe CCDC segments`
        ))
}

// Where a producer's segments live, from the terms it declared. Null for one that computes them.
export const segmentsAssetOf = ({assetId, record, declared}) =>
    assetId !== undefined
        ? assetId
        : declared?.segmentsAsset?.(record.model) ?? null

export const resolveSegmentProducer = (reference, recipesById) => {
    const producer = resolveProvider(reference, recipesById, CCDC_SEGMENTS)
    return producer.error
        ? {error: asSegmentSourceError(producer.error)}
        : producer
}

// The codes and wording a reader of segments reports, which are observable here and at the Earth Engine
// boundary. The walk's own diagnosis of a source it could not resolve or follow already reads correctly.
const asSegmentSourceError = ({reason, record, message}) => {
    if (record) {
        return new SegmentSourceError(
            reason === UNSUPPORTED ? UNSUPPORTED_SEGMENT_SOURCE : MALFORMED_SEGMENT_SOURCE,
            `${record.type} recipe ${record.id} produces no segments`
        )
    }
    if (reason === UNRESOLVED) {
        return new SegmentSourceError(UNRESOLVED_SEGMENT_SOURCE, message)
    }
    return new SegmentSourceError(
        MALFORMED_SEGMENT_SOURCE,
        reason === NOT_A_SOURCE ? 'Not a source segments can be read from' : message
    )
}
