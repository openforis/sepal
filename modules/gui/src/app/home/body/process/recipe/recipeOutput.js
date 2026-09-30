import _ from 'lodash'

import {NEEDS_EVIDENCE, readImageOutput, READY} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {dependencyValidity, VALID} from '#sepal/recipe/source/dependencyValidity'
import {MISSING_SOURCE} from '#sepal/recipe/source/diagnostic'

import {getRecipeType} from '../recipeTypeRegistry'
import {IMAGE_OUTPUT} from './layerProduct'
import {recipeContent} from './recipeContent'

// Which bands a configured recipe provides for one product, answered synchronously from what the session holds
// and what an acquisition owner has retained. It never starts work; it says what work would settle the answer.
//
//   status     READY | NEEDS_EVIDENCE | UNAVAILABLE | INVALID
//   authority  DESCRIBED for a READY answer, resolved through the type's declaration; null otherwise
//   description         the resolved description itself, as resolved, for a READY answer; null otherwise
//   presentation        display decoration by band name - labels, tooltips, `display` precision and range -
//                       only for bands the answer holds, never deciding which exist
//   availableBands      the two joined by name, in the shape selectors and presets filter against
//   dependencyValidity  whether the whole closure is structurally sound; null while unknown
//   acquisition         {kind, key} the answer still needs, or null
//
// The session's loaded records are read first. A record it lacks is ordinary lazy loading, never a deletion. Where
// that answer needs a record or an observation, or its closure is incomplete so its validity is unknown, the owner
// acquires: DESCRIBE runs the one-shot description of the canonical output, DEPENDENCIES only completes the closure,
// for a map product whose bands are already known and must not be failed by describing another.
//
// An answer comes from one snapshot. A retained DESCRIBE terminal answers description and validity together. A
// DEPENDENCIES terminal answers validity beside a map-product answer, which reads nothing but the root recipe -
// including its runtime evidence - so the terminal's basis proves it read that same root.

export {IMAGE_OUTPUT, layerProduct, productArgs} from './layerProduct'
export {NEEDS_EVIDENCE, READY} from '#sepal/recipe/output/readImageOutput'

export const UNAVAILABLE = 'UNAVAILABLE'
export const INVALID = 'INVALID'
export const DESCRIBED = 'DESCRIBED'
export const DESCRIBE = 'DESCRIBE'
export const DEPENDENCIES = 'DEPENDENCIES'
export const UNKNOWN_PRODUCT = 'UNKNOWN_PRODUCT'

export const readRecipeOutput = ({recipe, product, graph, heldFor = () => null}) => {
    const session = sessionAnswer({recipe, product, graph})
    const kind = session.acquisition
    const acquisition = kind ? {kind, key: acquisitionKey(kind, graph)} : null
    const held = acquisition && heldFor(acquisition.key)
    return {
        ...(held ? heldAnswer({recipe, product, session, kind, terminal: held}) : session),
        acquisition
    }
}

// Drawn only from a description over dependencies known to be sound. A failed description withholds the preview
// even over a valid closure.
export const canPreview = ({status, bands, dependencyValidity}) =>
    status === READY && bands.length > 0 && dependencyValidity?.status === VALID

// Display precision by band, in the shape the cursor reads.
export const displayTypes = ({presentation}) =>
    _.mapValues(presentation, 'display')

// What the acquisition depends on: the kind of work and the content of every record the session graph holds.
// Visualization settings are the preview's concern, not this.
export const acquisitionKey = (kind, graph) =>
    ({kind, content: graph.recipes.map(recipeContent)})

// Whether a terminal is about the records the session holds now. Records the operation loaded that the session
// does not hold cannot be compared, and do not count against it.
export const compatibleBasis = (basis = [], graph) => {
    const current = new Map(graph.recipes.map(record => [record.id, record]))
    return basis.every(({id, content}) => !current.has(id) || _.isEqual(content, recipeContent(current.get(id))))
}

const sessionAnswer = ({recipe, product, graph}) => {
    if (!product) {
        return answer({status: INVALID, diagnostics: [{code: UNKNOWN_PRODUCT}]})
    }
    const validity = isComplete(graph) ? dependencyValidity({status: 'COMPLETE', graph}) : null
    // Validity is worth acquiring only beside an answer that could be drawn.
    const pending = (kind, {status}) => validity || status !== READY ? null : kind
    if (product.name !== IMAGE_OUTPUT) {
        return mapProduct({recipe, product, graph, validity, pending})
    }
    let read
    try {
        read = readImageOutput({graph, declarationFor})
    } catch (error) {
        return answer({status: INVALID, error, validity})
    }
    const {status, description, diagnostics} = read
    if (status === READY) {
        const result = described({recipe, product, description, validity})
        return {...result, acquisition: pending(DESCRIBE, result)}
    }
    return status === NEEDS_EVIDENCE
        ? {...answer({status: NEEDS_EVIDENCE, diagnostics, validity}), acquisition: DESCRIBE}
        : answer({status: INVALID, diagnostics, validity})
}

// A map product is described from its root's configuration alone, so the session answers it and only validity is
// acquired. Whatever its declaration refuses is invalid, as is a product its type does not declare.
const mapProduct = ({recipe, product, graph, validity, pending}) => {
    let read
    try {
        read = readImageOutput({graph, declarationFor, product, productFor})
    } catch (error) {
        return answer({status: INVALID, error, validity})
    }
    if (read.status !== READY) {
        return answer({status: INVALID, diagnostics: read.diagnostics, validity})
    }
    const result = described({recipe, product, description: read.description, validity})
    return {...result, acquisition: pending(DEPENDENCIES, result)}
}

const heldAnswer = ({recipe, product, session, kind, terminal}) => {
    const validity = terminal.dependencyValidity || null
    if (kind === DEPENDENCIES) {
        return {...session, dependencyValidity: validity, error: terminal.error || null}
    }
    const {status, description, diagnostics = [], error = null} = terminal
    if (status === READY) {
        return described({recipe, product, description, validity})
    }
    return answer({status: status === INVALID ? INVALID : UNAVAILABLE, diagnostics, error, validity})
}

const described = ({recipe, product, description, validity}) => {
    const {bandPresentation} = getRecipeType(recipe.type) || {}
    const table = bandPresentation?.(recipe, product) || {}
    const bands = description.output.bands
    const presentation = Object.fromEntries(bands.map(({name}) => [name, displayed(table[name])]))
    return answer({
        status: READY,
        authority: DESCRIBED,
        description,
        bands,
        presentation,
        availableBands: Object.fromEntries(bands.map(({name, dataType, encoding}) => [name, {
            ...presentation[name],
            ...(dataType && {dataType}),
            ...(encoding && {encoding})
        }])),
        validity
    })
}

const displayed = entry => {
    const {dataType, ...decoration} = entry || {}
    const {arrayDimensions: _arrayDimensions, ...display} = dataType || {}
    return _.isEmpty(display) ? decoration : {...decoration, display}
}

const answer = ({
    status, authority = null, description = null, bands = [], presentation = {}, availableBands = {}, validity = null,
    diagnostics = [], error = null
}) => ({
    status, authority, description, bands, presentation, availableBands, dependencyValidity: validity, diagnostics, error
})

const isComplete = graph =>
    !graph.diagnostics.some(({code}) => code === MISSING_SOURCE)

const declarationFor = recipe => recipeType(recipe.type)?.imageOutput

const productFor = (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
