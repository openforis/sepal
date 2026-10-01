import _ from 'lodash'

import {NEEDS_EVIDENCE, readImageOutput, READY} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {dependencyValidity, VALID} from '#sepal/recipe/source/dependencyValidity'
import {MISSING_SOURCE} from '#sepal/recipe/source/diagnostic'
import {RECIPE_REF} from '#sepal/recipe/source/reference'

import {getRecipeType} from '../recipeTypeRegistry'
import {isDefinitiveFailure} from '../sourceRuntime/assetEvidence'
import {recordCurrency} from '../sourceRuntime/recordCurrency'
import {SOURCE_REVISION_BEHIND} from '../sourceRuntime/sourceRuntimeError'
import {IMAGE_OUTPUT} from './layerProduct'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {recipeContent} from './recipeContent'

// Which bands a configured recipe provides for one product, answered synchronously from what the session holds
// and what the source runtime holds for it. It never starts work; it says what work would settle the answer.
//
//   status     READY | NEEDS_EVIDENCE | UNAVAILABLE | INVALID
//   authority  DESCRIBED for a READY answer, resolved through the type's declaration; null otherwise
//   description         the resolved description itself, as resolved, for a READY answer; null otherwise
//   presentation        display decoration by band name - labels, tooltips, `display` precision and range -
//                       only for bands the answer holds, never deciding which exist
//   availableBands      the two joined by name, in the shape selectors and presets filter against
//   dependencyValidity  whether the whole closure is structurally sound; null while unknown
//   acquisition         {kind, key} of the description loading the answer still needs, or null
//   assets              every asset the answer reads: those its session graph reaches, and those the held terminal's
//                       closure read
//
// The session's loaded records are read first. A record it lacks is ordinary lazy loading, never a deletion. Where
// that answer needs a record or an observation, or its closure is incomplete so its validity is unknown, the runtime
// loads what the key names for whoever watches the question (sourceRuntime/outputRegistry.js): DESCRIBE runs the
// one-shot description of the canonical output, DEPENDENCIES only completes the closure, for a map product whose bands
// are already known and must not be failed by describing another.
//
// A record the session caches is read from only while it is current (sourceRuntime/recordCurrency.js). One that is
// behind what the recipe listing says, or whose recipe the listing stopped listing, is read again first: REFRESH names
// those records, and nothing is answered until the session holds them as they are. A draft is never refreshed.
//
// An answer comes from one snapshot. A retained DESCRIBE terminal answers description and validity together. A
// DEPENDENCIES terminal answers validity beside a map-product answer, which reads nothing but the root recipe -
// including its runtime evidence - so the terminal's basis proves it read that same root.
//
// An asset the answer reads that a read found missing, or unreadable under these credentials (assetEvidence.js), makes
// it UNAVAILABLE, naming the asset - an answer described from configuration alone included, since its pixels are
// still read from it. The assets read are those the session graph reaches and those the held terminal's closure read.

export {IMAGE_OUTPUT, layerProduct, productArgs} from './layerProduct'
export {NEEDS_EVIDENCE, READY} from '#sepal/recipe/output/readImageOutput'

export const UNAVAILABLE = 'UNAVAILABLE'
export const INVALID = 'INVALID'
export const DESCRIBED = 'DESCRIBED'
export const DESCRIBE = 'DESCRIBE'
export const DEPENDENCIES = 'DEPENDENCIES'
export const REFRESH = 'REFRESH'
export const UNKNOWN_PRODUCT = 'UNKNOWN_PRODUCT'
export const ASSET_UNAVAILABLE = 'ASSET_UNAVAILABLE'

export const readRecipeOutput = ({recipe, product, graph, heldFor = () => null, currency = null, assetEvidence = {}}) => {
    const refresh = currency && refreshing({graph, currency, heldFor})
    if (refresh) {
        return {...refresh, assets: graphAssets(graph)}
    }
    const session = sessionAnswer({recipe, product, graph})
    const kind = session.acquisition
    const acquisition = kind ? {kind, key: acquisitionKey(kind, graph)} : null
    const held = acquisition && heldFor(acquisition.key)
    const assets = _.uniq([...graphAssets(graph), ...(held?.assets || [])]).sort()
    const missing = assets.find(id => isDefinitiveFailure(assetEvidence[id]))
    if (missing) {
        return {...answer({status: UNAVAILABLE, diagnostics: [{code: ASSET_UNAVAILABLE, assetId: missing}]}), acquisition, assets}
    }
    return {
        ...(held ? heldAnswer({recipe, product, session, kind, terminal: held}) : session),
        acquisition,
        assets
    }
}

// The assets the session graph reaches.
export const graphAssets = graph =>
    _.uniq(graph.edges.filter(({reference: {type}}) => type !== RECIPE_REF).map(({reference: {id}}) => id)).sort()

// What a watched question needs loaded, from the same graph and read its consumers render from: the acquisition with
// the recipe, graph and session records it names, or null when the session answers on its own or holds no such
// recipe.
export const outputLoading = ({recipeId, product, catalogue, session}) => {
    const recipe = catalogue[recipeId]
    if (!recipe) {
        return null
    }
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: catalogue})
    const {acquisition} = readRecipeOutput({recipe, product, graph, currency: session && recordCurrency(session)})
    // Refreshing reads storage, not the session's records, which are what it replaces.
    return acquisition && {acquisition, recipe, graph, records: acquisition.kind === REFRESH ? [] : graph.recipes}
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

// Records to read again before anything is answered: until they are, the answer needs them; if reading them failed,
// it is that failure; once they are read, a recipe that stopped being listed is known to be there still, while one
// storage still holds only an older revision of is no answer at all.
const refreshing = ({graph, currency, heldFor}) => {
    const records = graph.recipes.map(record => currency.staleness(record)).filter(Boolean)
    if (!records.length) {
        return null
    }
    const acquisition = {kind: REFRESH, key: {kind: REFRESH, records}}
    const held = heldFor(acquisition.key)
    if (!held) {
        return {...answer({status: NEEDS_EVIDENCE}), acquisition}
    }
    if (held.status !== 'COMPLETE') {
        return {...answer({status: UNAVAILABLE, diagnostics: held.diagnostics || [], error: held.error || null}), acquisition}
    }
    const behind = records.filter(({withdrawn}) => !withdrawn)
    return behind.length
        ? {
            ...answer({status: UNAVAILABLE, diagnostics: behind.map(({id}) => ({code: SOURCE_REVISION_BEHIND, recipeId: id}))}),
            acquisition
        }
        : null
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
