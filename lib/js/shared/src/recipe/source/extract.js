import {diagnostic, INCOMPLETE_REFERENCE, MALFORMED_REFERENCE} from './diagnostic.js'
import {sourceEdge} from './edge.js'
import {assetReference, isReferenceId, recipeReference} from './reference.js'

// Generic extraction helpers shared by recipe-type definitions.
//
// These know how to read a persisted model safely and how to turn a value into an edge or a controlled
// diagnostic. They know nothing about any particular recipe type - which fields exist, what a reference
// found there means, and which role it plays are the owning definition's business.
//
// One rule decides silence versus diagnosis: an absent or empty container means nothing was selected, which
// every recipe starts out as; a container that has been written to but cannot yield a usable reference is
// broken and says so. That is the difference between a recipe still being configured and a recipe whose
// dependency vanished.

export const isPlainObject = value =>
    !!value && typeof value === 'object' && !Array.isArray(value)

export const isBlank = value =>
    value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)

// Absent, or present but holding nothing.
export const isUnselected = value =>
    value === undefined || value === null || (isPlainObject(value) && Object.keys(value).length === 0)

export const edgeResult = ({reference, role, path}) => ({edge: sourceEdge({reference, role, path})})

export const diagnosticResult = ({code, role, path}) => ({diagnostic: diagnostic({code, role, path})})

// Walks to a value inside the model and reports where the walk broke. Anything on the way that exists but
// is not an object cannot be read; answering "absent" there would silently drop everything it holds.
export const readAt = (model, keys) => {
    let container
    let value = model
    for (let index = 0; index < keys.length; index++) {
        if (value === undefined || value === null) {
            return {}
        }
        if (!isPlainObject(value)) {
            return {malformedPath: ['model', ...keys.slice(0, index)]}
        }
        container = value
        value = value[keys[index]]
    }
    return {value, container}
}

// One id value. `required` marks a position whose container already exists, where a blank id is a broken
// selection rather than an unmade one.
export const idResults = ({id, toReference, role, path, required = false}) => {
    if (isBlank(id)) {
        return required
            ? [diagnosticResult({code: INCOMPLETE_REFERENCE, role, path})]
            : []
    }
    return isReferenceId(id)
        ? [edgeResult({reference: toReference(id), role, path})]
        : [diagnosticResult({code: MALFORMED_REFERENCE, role, path})]
}

export const fromId = ({model, keys, toReference, role, requiredWhenPresent = false}) => {
    const {value, container, malformedPath} = readAt(model, keys)
    return malformedPath
        ? [diagnosticResult({code: MALFORMED_REFERENCE, role, path: malformedPath})]
        : idResults({
            id: value,
            toReference,
            role,
            path: ['model', ...keys],
            required: requiredWhenPresent && !isUnselected(container)
        })
}

// A list container that exists but is not a list cannot be read as empty - that would drop every reference
// it holds - and must not be handed to an array method either, which turns a broken recipe into an
// incidental JavaScript error at a shared boundary.
export const fromList = ({model, keys, role, itemResults}) => {
    const {value, malformedPath} = readAt(model, keys)
    if (malformedPath) {
        return [diagnosticResult({code: MALFORMED_REFERENCE, role, path: malformedPath})]
    }
    const path = ['model', ...keys]
    if (value === undefined || value === null) {
        return []
    }
    return Array.isArray(value)
        ? value.flatMap((item, index) => itemResults(item, [...path, index]))
        : [diagnosticResult({code: MALFORMED_REFERENCE, role, path})]
}

// A source selected through a panel section, stored as {type, id} alongside whatever description was copied
// off it at selection time. `type` is the section: without one there is nothing to resolve the id against,
// so a populated selection missing its type is incomplete rather than absent. A Map, because the key is a
// string read out of a persisted model and an inherited member such as `toString` must not answer.
const SELECTION_REFERENCE = new Map([
    ['RECIPE_REF', recipeReference],
    ['ASSET', assetReference]
])

export const selectionResults = ({selection, role, path}) => {
    if (isUnselected(selection)) {
        return []
    }
    if (!isPlainObject(selection)) {
        return [diagnosticResult({code: MALFORMED_REFERENCE, role, path})]
    }
    if (isBlank(selection.type)) {
        return [diagnosticResult({code: INCOMPLETE_REFERENCE, role, path})]
    }
    const toReference = SELECTION_REFERENCE.get(selection.type)
    return toReference
        ? idResults({id: selection.id, toReference, role, path, required: true})
        : [diagnosticResult({code: MALFORMED_REFERENCE, role, path})]
}

export const fromSelection = ({model, keys, role}) => {
    const {value, malformedPath} = readAt(model, keys)
    return malformedPath
        ? [diagnosticResult({code: MALFORMED_REFERENCE, role, path: malformedPath})]
        : selectionResults({selection: value, role, path: ['model', ...keys]})
}
