import {throwError} from 'rxjs'

import {
    MALFORMED_SEGMENT_SOURCE,
    PRESERVES,
    PRODUCES,
    segmentProviderStep,
    UNSUPPORTED_SEGMENT_SOURCE
} from '#sepal/recipe/capability/ccdcSegments'
import {ASSET} from '#sepal/recipe/source/reference'

import {getRecipeType} from '../recipeTypeRegistry'
import {describeSegmentsAsset$} from './ccdc/segmentsAsset'

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
    if (producer.error) {
        return throwError(() => producer.error)
    }
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

// Which recipe or asset produces the segments this reference stands for, over records already resolved.
// Cycles cannot be followed here: the closure that produced these records rejected them already.
const resolveSegmentProducer = (reference, recipesById) => {
    const seen = new Set()
    let current = reference
    while (current) {
        if (current.type === ASSET) {
            return {assetId: current.id}
        }
        if (seen.has(current.id)) {
            return {error: new SegmentSourceError(
                MALFORMED_SEGMENT_SOURCE, `Source references itself: ${current.id}`
            )}
        }
        seen.add(current.id)
        const record = recipesById.get(current.id)
        if (!record) {
            return {error: new SegmentSourceError(
                UNRESOLVED_SEGMENT_SOURCE, `Source recipe ${current.id} was not resolved`
            )}
        }
        const {status, reference: preserved} = segmentProviderStep(record)
        if (status === PRODUCES) {
            return {record}
        }
        if (status !== PRESERVES) {
            return {error: new SegmentSourceError(status, `${record.type} recipe ${record.id} produces no segments`)}
        }
        current = preserved
    }
    return {error: new SegmentSourceError(MALFORMED_SEGMENT_SOURCE, 'Not a source segments can be read from')}
}
