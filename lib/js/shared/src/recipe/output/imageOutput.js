// A pure runtime image-output description. The execution reference remains the selected outer source,
// while ordered bands own their physical schema, optional per-band export requirements and optional value
// encoding. Evidence entries are opaque and retained by identity. Validation accumulates diagnostics and
// never returns a partial description. This module performs no resolution, policy inference or Earth Engine
// task conversion.
//
// The bands are those available from the configured recipe. An operation selects from them by name; what it
// executes is that selection, not whatever the producer builds when asked for nothing.

import {INCOMPLETE_REFERENCE, MALFORMED_REFERENCE} from '../source/diagnostic.js'
import {isBlank, isPlainObject} from '../source/extract.js'
import {ASSET, RECIPE_REF} from '../source/reference.js'
import {isValidEncoding, normalizedEncoding} from './bandEncoding.js'
import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, MALFORMED_IMAGE_OUTPUT} from './diagnostic.js'

const REFERENCE_TYPES = new Set([RECIPE_REF, ASSET])

const diagnosis = (code, path) => ({code, path})

const referenceDiagnostics = executionReference => {
    if (executionReference === undefined || executionReference === null) {
        return [diagnosis(INCOMPLETE_REFERENCE, ['executionReference'])]
    }
    if (!isPlainObject(executionReference)) {
        return [diagnosis(MALFORMED_REFERENCE, ['executionReference'])]
    }

    const diagnostics = []
    const {type, id} = executionReference
    if (isBlank(type)) {
        diagnostics.push(diagnosis(INCOMPLETE_REFERENCE, ['executionReference', 'type']))
    } else if (typeof type !== 'string' || !REFERENCE_TYPES.has(type)) {
        diagnostics.push(diagnosis(MALFORMED_REFERENCE, ['executionReference', 'type']))
    }
    if (isBlank(id)) {
        diagnostics.push(diagnosis(INCOMPLETE_REFERENCE, ['executionReference', 'id']))
    } else if (typeof id !== 'string') {
        diagnostics.push(diagnosis(MALFORMED_REFERENCE, ['executionReference', 'id']))
    }
    return diagnostics
}

const bandDiagnostics = bands => {
    if (bands === undefined || bands === null) {
        return [diagnosis(INCOMPLETE_IMAGE_OUTPUT, ['bands'])]
    }
    if (!Array.isArray(bands)) {
        return [diagnosis(MALFORMED_IMAGE_OUTPUT, ['bands'])]
    }

    const diagnostics = []
    const names = new Set()
    bands.forEach((band, index) => {
        const path = ['bands', index]
        if (!isPlainObject(band)) {
            diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, path))
            return
        }

        const {name, dataType, pyramidingPolicy} = band
        if (isBlank(name)) {
            diagnostics.push(diagnosis(INCOMPLETE_IMAGE_OUTPUT, [...path, 'name']))
        } else if (typeof name !== 'string') {
            diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, [...path, 'name']))
        } else if (names.has(name)) {
            diagnostics.push(diagnosis(DUPLICATE_BAND_NAME, [...path, 'name']))
        } else {
            names.add(name)
        }

        if (dataType !== undefined) {
            if (!isPlainObject(dataType)) {
                diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, [...path, 'dataType']))
            } else if (dataType.arrayDimensions === undefined) {
                diagnostics.push(diagnosis(INCOMPLETE_IMAGE_OUTPUT, [...path, 'dataType', 'arrayDimensions']))
            } else if (!Number.isInteger(dataType.arrayDimensions) || dataType.arrayDimensions < 0) {
                diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, [...path, 'dataType', 'arrayDimensions']))
            }
        }

        if (pyramidingPolicy !== undefined) {
            if (isBlank(pyramidingPolicy)) {
                diagnostics.push(diagnosis(INCOMPLETE_IMAGE_OUTPUT, [...path, 'pyramidingPolicy']))
            } else if (typeof pyramidingPolicy !== 'string') {
                diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, [...path, 'pyramidingPolicy']))
            }
        }

        // Readers turn unusable stored metadata into absence, so an invalid encoding here is a producer fault.
        if (band.encoding !== undefined && !isValidEncoding(band.encoding)) {
            diagnostics.push(diagnosis(MALFORMED_IMAGE_OUTPUT, [...path, 'encoding']))
        }
    })
    return diagnostics
}

const evidenceDiagnostics = evidence =>
    Array.isArray(evidence)
        ? []
        : [diagnosis(MALFORMED_IMAGE_OUTPUT, ['evidence'])]

export const imageOutputDescription = input => {
    const {executionReference, bands, evidence = []} = isPlainObject(input) ? input : {}
    const diagnostics = [
        ...referenceDiagnostics(executionReference),
        ...bandDiagnostics(bands),
        ...evidenceDiagnostics(evidence)
    ]

    if (diagnostics.length) {
        return {description: null, diagnostics}
    }

    return {
        description: {
            executionReference: {
                type: executionReference.type,
                id: executionReference.id
            },
            output: {
                kind: 'IMAGE',
                bands: bands.map(({name, dataType, pyramidingPolicy, encoding}) => ({
                    name,
                    ...(dataType !== undefined && {
                        dataType: {arrayDimensions: dataType.arrayDimensions}
                    }),
                    ...(pyramidingPolicy !== undefined && {pyramidingPolicy}),
                    ...(encoding !== undefined && {encoding: normalizedEncoding(encoding)})
                }))
            },
            evidence: [...evidence]
        },
        diagnostics
    }
}
