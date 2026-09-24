// Bottom-up IMAGE_OUTPUT resolution over an existing dependency graph.
//
// Answers one question: which bands does the root of this graph provide, and what is established about them?
// Pure, and it holds no recipe-type knowledge - each type's provider decides what its answer needs, and every
// fact that can only be observed of a running image or a stored asset arrives through an injected observation.
// So the GUI, GEE and Task can each answer it about the same records without agreeing on anything else.
//
// A provider asks, through the access it is given, for its own observation, the source filling its declared
// role, or every role-bearing source. The resolver answers each once per recipe, validates roles, resolves
// sources recursively and diagnoses what cannot be had; a provider that asked for anything unavailable has its
// answer discarded.
//
// Only what providers read can fail a description: a structural diagnosis is reported when a read reaches the edge
// or recipe that owns it. A cycle is a read of a recipe still being described, never the graph's cycle mark, which
// depends on traversal order. Before a recipe's own observation is requested, every structural diagnosis reachable
// from it is reported instead. Whether the dependencies are sound is asked separately (source/dependencyValidity.js).
// See "Dependency-scoped descriptions" in docs/design/recipes/gui-source-runtime.md.
//
// Resolution is recursive in edge order with per-recipe memoization, which is what separates a diamond
// from a repetition: a shared node is resolved once and reused, so it is described once, observed once
// and - when it cannot be described - diagnosed once rather than once per incoming edge. A diagnosis the graph
// owns is reported once however many reads reach it.
//
// Diagnostics are emitted where they are found rather than returned and merged by callers, and nothing
// is sorted afterwards: traversal order is the reported order. Buffering any one kind on its parent
// would reorder it against the kinds that report immediately, so an asset and a recipe selected by the
// same node would come back in an order their edges do not explain.

import {CYCLIC_DEPENDENCY} from '../source/diagnostic.js'
import {ASSET, RECIPE_REF} from '../source/reference.js'
import {AMBIGUOUS_ROLE, MISSING_ROLE, UNAVAILABLE_DESCRIPTION, UNDECLARED_OUTPUT} from './diagnostic.js'
import {imageOutputDescription} from './imageOutput.js'

// An asset is never a graph node, so it has no recipe path of its own and is diagnosed against the
// recipe that selected it, located by the edge.
const unavailable = (reference, recipePath, edge) => edge
    ? {code: UNAVAILABLE_DESCRIPTION, role: edge.role, path: edge.path, recipePath, reference}
    : {code: UNAVAILABLE_DESCRIPTION, path: [], recipePath, reference}

export const resolveImageOutput = ({graph, declarationFor, observationFor}) => {
    const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
    const edgesBySourceId = new Map()
    graph.edges.forEach(edge => {
        const declared = edgesBySourceId.get(edge.sourceRecipeId)
        if (declared) {
            declared.push(edge)
        } else {
            edgesBySourceId.set(edge.sourceRecipeId, [edge])
        }
    })
    const declaredEdges = id => edgesBySourceId.get(id) || []
    const ownDiagnostics = id => graph.recipeDiagnostics?.get(id) || []

    const resolved = new Map()
    const describing = new Set()
    const diagnostics = []
    const reported = new Set()

    // A diagnosis the graph owns is one fact, however many reads arrive at it.
    const report = owned => {
        if (!reported.has(owned)) {
            reported.add(owned)
            diagnostics.push(owned)
        }
    }

    // Every candidate goes through the image output contract, so no provider can introduce a
    // duplicate band name or a blank policy that the rest of the system would have to defend against.
    // It is also the ownership boundary: the arrays and band descriptors it returns are newly built,
    // while evidence entries stay the objects they were. `attribution` names the producer, which for a
    // recipe is its path and for an asset is its reference - the field path is already taken by the
    // failing field, so without it two malformed assets under one recipe would be indistinguishable.
    const describe = (candidate, reference, attribution) => {
        const {bands, evidence} = candidate || {}
        const described = imageOutputDescription({executionReference: reference, bands, evidence})
        described.diagnostics.forEach(diagnostic => diagnostics.push({...diagnostic, ...attribution}))
        return described.description
    }

    const resolveAsset = (edge, recipePath) => {
        const observation = observationFor(edge.reference)
        if (observation === undefined || observation === null) {
            diagnostics.push(unavailable(edge.reference, recipePath, edge))
            return null
        }
        return describe(observation, edge.reference, {recipePath, reference: edge.reference})
    }

    // The graph marks every edge whose target it could not find, so absence is read from the graph rather
    // than decided here.
    const absentTarget = edge => {
        if (!edge.diagnostic) {
            throw new Error(`The dependency graph holds no diagnosis for the absent recipe ${edge.reference.id}`)
        }
        report(edge.diagnostic)
        return null
    }

    const resolveRecipeEdge = (edge, recipePath) => {
        const {reference: {id}, role, path} = edge
        const target = recipesById.get(id)
        if (!target) {
            return absentTarget(edge)
        }
        if (describing.has(id)) {
            diagnostics.push({code: CYCLIC_DEPENDENCY, role, path, recipePath: [...recipePath, id]})
            return null
        }
        return resolveRecipe(target, [...recipePath, id])
    }

    const resolveEdge = (edge, recipePath) => {
        const description = edge.reference.type === ASSET
            ? resolveAsset(edge, recipePath)
            : resolveRecipeEdge(edge, recipePath)
        return description ? {role: edge.role, description} : null
    }

    // Every structural diagnosis reachable from a recipe, by what owns it: each reachable recipe's own model and
    // each reachable edge. Found by reachability rather than by the paths the graph recorded, which name whichever
    // branch arrived first.
    const reachableFailures = id => {
        const failures = []
        const visited = new Set()
        const visit = recipeId => {
            visited.add(recipeId)
            failures.push(...ownDiagnostics(recipeId))
            declaredEdges(recipeId).forEach(edge => {
                if (edge.diagnostic) {
                    failures.push(edge.diagnostic)
                }
                const {type, id: targetId} = edge.reference
                if (type === RECIPE_REF && recipesById.has(targetId) && !visited.has(targetId)) {
                    visit(targetId)
                }
            })
        }
        visit(id)
        return failures
    }

    const ownObservation = (recipe, reference, recipePath) => {
        const failures = reachableFailures(recipe.id)
        if (failures.length) {
            failures.forEach(report)
            return null
        }
        const observation = observationFor(reference)
        if (observation === undefined || observation === null) {
            diagnostics.push(unavailable(reference, recipePath))
            return null
        }
        return observation
    }

    // A role whose own field is broken is diagnosed as that, rather than as a role no edge carries.
    const roleInput = (recipe, role, recipePath) => {
        if (role === undefined) {
            throw new Error(`Recipe type ${recipe.type} reads its input without declaring a role`)
        }
        const broken = ownDiagnostics(recipe.id).filter(owned => owned.role === role)
        if (broken.length) {
            broken.forEach(report)
            return null
        }
        const matching = declaredEdges(recipe.id).filter(edge => edge.role === role)
        if (matching.length !== 1) {
            diagnostics.push({code: matching.length ? AMBIGUOUS_ROLE : MISSING_ROLE, role, path: [], recipePath})
            return null
        }
        return resolveEdge(matching[0], recipePath)?.description || null
    }

    // Every edge is resolved before any is tested, so two independently broken branches are both diagnosed
    // rather than only the first.
    const allInputs = (recipe, recipePath) => {
        const broken = ownDiagnostics(recipe.id).filter(owned => owned.role !== undefined)
        broken.forEach(report)
        const inputs = declaredEdges(recipe.id).map(edge => resolveEdge(edge, recipePath))
        return !broken.length && inputs.every(Boolean) ? inputs : null
    }

    // A recipe whose own model cannot be read - malformed, or of a type nothing defines - is never handed to a
    // provider, and is not mistaken for one that merely declares no output.
    const describeRecipe = (recipe, recipePath) => {
        const unreadable = ownDiagnostics(recipe.id).filter(owned => owned.role === undefined)
        if (unreadable.length) {
            unreadable.forEach(report)
            return null
        }
        const provider = declarationFor(recipe)
        if (!provider) {
            diagnostics.push({code: UNDECLARED_OUTPUT, path: [], recipePath})
            return null
        }
        const reference = {type: RECIPE_REF, id: recipe.id}
        let unresolved = false
        // Answered once each, so asking twice neither observes nor diagnoses twice.
        const once = read => {
            let answer
            return () => {
                if (answer === undefined) {
                    answer = read()
                    unresolved = unresolved || answer === null
                }
                return answer
            }
        }
        const candidate = provider.describe({
            recipe,
            observation: once(() => ownObservation(recipe, reference, recipePath)),
            input: once(() => roleInput(recipe, provider.role, recipePath)),
            inputs: once(() => allInputs(recipe, recipePath))
        })
        return unresolved
            ? null
            : describe(candidate, reference, {recipePath})
    }

    // Memoized on presence, not on truth: a node that failed is still resolved, and re-resolving it
    // would observe it again and diagnose it once per incoming edge. A recipe is marked as being described for
    // exactly as long as its provider runs, which is the read path a cycle is detected on.
    const resolveRecipe = (recipe, recipePath) => {
        if (resolved.has(recipe.id)) {
            return resolved.get(recipe.id)
        }
        describing.add(recipe.id)
        let description
        try {
            description = describeRecipe(recipe, recipePath)
        } finally {
            describing.delete(recipe.id)
        }
        resolved.set(recipe.id, description)
        return description
    }

    const [rootRecipe] = graph.recipes
    const description = resolveRecipe(rootRecipe, [rootRecipe.id])
    return diagnostics.length
        ? {description: null, diagnostics}
        : {description, diagnostics}
}
