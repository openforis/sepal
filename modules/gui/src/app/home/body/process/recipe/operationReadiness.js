import {NEEDS_EVIDENCE, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {NOT_READY, PIXEL_OBSERVATIONS, PIXEL_SEGMENTS} from '#sepal/recipe/output/readiness'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {dependencyValidity, INVALID, VALID} from '#sepal/recipe/source/dependencyValidity'
import {MISSING_SOURCE} from '#sepal/recipe/source/diagnostic'
import {directSourceEdges} from '#sepal/recipe/source/directSources'

import {getRecipeType} from '../recipeTypeRegistry'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {recipeContent} from './recipeContent'

// Whether one operation over a recipe can run, other than its image output: what the recipe's type declares that
// operation requires (#sepal/recipe/output/readiness), read from what the session holds and from what the source
// runtime holds for that operation alone (sourceRuntime/sourceRuntime.js), never from an image-output answer. Nothing of
// the recipe's own image is described, so a check needing only records asks Earth Engine for nothing.
//
//   readiness           {status: READY | NEEDS_EVIDENCE | NOT_READY | UNAVAILABLE, findings, needs}
//   dependencyValidity  whether the operation's closure is structurally sound; null while unknown
//   acquisition         {kind: READINESS, key} of the loading the answer still needs, or null
//   error               why that loading failed, where it did
//   computation         the content of every record the operation's graph holds (recipeContent.js), its root first:
//                       what it computes from, as a map layer compares what it draws from, so a change to any of them -
//                       and nothing else - is a reason to run it again
//   recordOf(id)        a record of the operation's closure as this read resolved it: the session's where its graph
//                       holds it, otherwise as a COMPLETE answer the runtime holds read it (its `basis`), or null. An
//                       answer held is current by the runtime's own rules (outputRegistry.js); a pending or unavailable
//                       one resolves nothing. Only what the operation read is resolved, nothing is loaded for it, and
//                       nothing it resolves is installed in the session
//
// The session answers alone where its graph is complete and what it reads settles readiness. A finding settles it
// whatever else is missing. Otherwise the runtime completes the closure and settles readiness over it, under a key
// naming the operation and the records read.
//
// The recipe judged is the one the operation runs. A pixel's observations, and the segments a CCDC fits there, are read
// at the clicked point, whichever it is, so their recipe has no AOI: one the recipe configures is no dependency of them,
// and no point is assumed for it.

export const READINESS = 'READINESS'

// Where what the answer needed could not be had.
export const UNAVAILABLE = 'UNAVAILABLE'

export const readOperationReadiness = ({recipe, operation, loadedRecipes, heldFor = () => null}) => {
    const graph = buildMapDependencyGraph({recipe: recipeForOperation(recipe, operation), loadedRecipes})
    const session = sessionReadOf(graph, operation)
    if (!session.acquisition) {
        return session
    }
    const held = heldFor(session.acquisition.key)
    if (!held) {
        return session
    }
    return held.status === 'COMPLETE'
        ? {
            ...session,
            readiness: held.readiness || session.readiness,
            dependencyValidity: held.dependencyValidity,
            error: null,
            recordOf: id => session.recordOf(id) || basisRecord(held, id)
        }
        : {...session, readiness: {...session.readiness, status: UNAVAILABLE}, dependencyValidity: held.dependencyValidity, error: held.error || null}
}

// What a watched operation question needs loaded (outputRegistry.js): the acquisition with the recipe the operation runs,
// its graph and the session records it names, or null when the session answers alone.
export const operationLoading = ({recipeId, operation, catalogue}) => {
    const submitted = catalogue[recipeId]
    if (!submitted) {
        return null
    }
    const recipe = recipeForOperation(submitted, operation)
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: catalogue})
    const {acquisition} = sessionReadOf(graph, operation)
    return acquisition && {acquisition, recipe, graph, records: graph.recipes}
}

// The section of the recipe that a finding over it is said in, as its type's declarations over its output locate the
// same finding (sourceRequirements.js) - its own, or one of a recipe it references, where a declaration names that
// edge's role (`upstreamReferences`) - or null where none does.
export const sectionOfFindings = (recipe, findings) => {
    const declarations = (getRecipeType(recipe.type)?.sourceRequirements || []).filter(({outputDiagnostics}) => outputDiagnostics)
    const own = findings
        .filter(({recipePath = []}) => recipePath.length === 1 && recipePath[0] === recipe.id)
        .flatMap(finding => declarations.filter(({outputDiagnostics: {codes, itemOf}}) =>
            codes.includes(finding.code) && itemOf(finding, recipe, {recipeNames: {}})))
    const upstream = findings
        .filter(({recipePath = []}) => recipePath.length > 1 && recipePath[0] === recipe.id)
        .flatMap(({recipePath}) => declarations.filter(({outputDiagnostics: {upstreamReferences = []}}) =>
            referencesThrough(recipe, upstreamReferences).includes(recipePath[1])))
    return [...own, ...upstream][0]?.section.label || null
}

// The recipes the recipe's own edges in `roles` name.
const referencesThrough = (recipe, roles) => roles.length
    ? directSourceEdges(recipe).edges
        .filter(({role, reference}) => roles.includes(role) && reference.type === 'RECIPE_REF')
        .map(({reference}) => reference.id)
    : []

// The recipe an operation runs, the same object for the same recipe, so a render reuses its graph - and what is read
// for it, its assets included, is read of this one.
export const recipeForOperation = (recipe, operation) => {
    if (!AT_PIXEL.includes(operation) || !recipe.model?.aoi) {
        return recipe
    }
    if (!AT_ANY_PIXEL.has(recipe)) {
        const {aoi: _aoi, ...model} = recipe.model
        AT_ANY_PIXEL.set(recipe, {...recipe, model})
    }
    return AT_ANY_PIXEL.get(recipe)
}

const AT_ANY_PIXEL = new WeakMap()

// The operations that read no AOI the recipe configures: a pixel chart's, run at the point clicked. A Classification they
// train is judged over its own imagery.
const AT_PIXEL = [PIXEL_OBSERVATIONS, PIXEL_SEGMENTS]

// The graph is cached by identity (mapDependencyGraph.js), so its read is too: per operation.
const sessionReadOf = (graph, operation) => {
    const reads = SESSION_READS.get(graph) || new Map()
    SESSION_READS.set(graph, reads)
    if (!reads.has(operation)) {
        reads.set(operation, sessionRead(graph, operation))
    }
    return reads.get(operation)
}

const SESSION_READS = new WeakMap()

const sessionRead = (graph, operation) => {
    const {readiness} = readReadiness({graph, operation, declarationFor, readinessFor})
    const validity = isComplete(graph) ? dependencyValidity({status: 'COMPLETE', graph}) : null
    const settled = readiness.status === NOT_READY
        || validity?.status === INVALID
        || (validity?.status === VALID && readiness.status !== NEEDS_EVIDENCE)
    const computation = graph.recipes.map(recipeContent)
    return {
        readiness,
        dependencyValidity: validity,
        acquisition: settled ? null : {kind: READINESS, key: {kind: READINESS, operation, content: computation}},
        error: null,
        computation,
        recordOf: id => graph.recipes.find(record => record.id === id) || null
    }
}

const basisRecord = ({basis = []}, id) =>
    basis.find(entry => entry.id === id)?.content || null

const isComplete = graph =>
    !graph.diagnostics.some(({code}) => code === MISSING_SOURCE)

const declarationFor = recipe => recipeType(recipe.type)?.imageOutput

const readinessFor = recipe => recipeType(recipe.type)
