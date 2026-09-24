import {CYCLIC_DEPENDENCY, diagnostic, MISSING_SOURCE} from './diagnostic.js'
import {directSourceEdges} from './directSources.js'
import {RECIPE_REF} from './reference.js'

// The recipe dependency graph.
//
// Composes the direct edges each recipe declares into one graph over recipe records that have already been
// loaded. It does no loading, no authorization, no capability derivation and no semantic lineage: it is given
// every record it may see, and a reference to anything else is a diagnosis rather than a fetch. Pure, so the
// GUI, GEE and Task can each answer the same question about the same records without agreeing on anything
// else.
//
// Every edge a recipe declares is kept, including the ones that go nowhere. An edge is what the user selected,
// and a graph that dropped the broken ones would describe a recipe that cannot run as one with no problem.
//
// Roles are carried, never interpreted. Which edge makes a wrapper mean what its source means is a separate
// question from which edges affect its output, and only the second one is asked here.
//
// `diagnostics` is the complete account, deduplicated for a user to act on. Each diagnosis is also held where
// it belongs, for a reader that asks about one part of the graph: on the edge whose target is absent or whose
// target closes a cycle, and under the recipe whose own model produced it. An absent target is marked on
// EVERY edge into it, since whether a recipe is present does not depend on which edge reached it first.

// `recipePath` is the chain of recipe ids from the root to the recipe being read, and doubles as the active
// stack: an edge into any id already on it closes a cycle. Deduplication is deliberately split. Whether a
// recipe has been EXPANDED is about work - a diamond is legal and must cost one expansion. Whether a recipe is
// on the ACTIVE PATH is about legality - the same recipe seen again on one path is a cycle, seen again on a
// sibling path is a diamond. One set cannot answer both: visited alone reports every diamond as a cycle, and
// the active path alone re-expands every diamond once per route into it.
export const buildRecipeDependencyGraph = ({rootRecipe, recipesById}) => {
    const recipes = []
    const edges = []
    const diagnostics = []
    const recipeDiagnostics = new Map()
    const expanded = new Set()
    const absent = new Set()

    const isRecipeEdge = ({reference}) => reference.type === RECIPE_REF

    const expand = (recipe, recipePath) => {
        expanded.add(recipe.id)
        recipes.push(recipe)
        const direct = directSourceEdges(recipe)
        // Every direct edge is appended before any descent, so edges stay grouped by the recipe that declared
        // them and their order cannot depend on how deep a subtree happens to be.
        const declared = direct.edges.map(edge => ({sourceRecipeId: recipe.id, ...edge}))
        declared.forEach(edge => edges.push(edge))
        const own = direct.diagnostics.map(directDiagnostic => ({...directDiagnostic, recipePath}))
        own.forEach(ownDiagnostic => diagnostics.push(ownDiagnostic))
        if (own.length) {
            recipeDiagnostics.set(recipe.id, own)
        }
        declared.filter(isRecipeEdge).forEach(edge => descend(edge, recipePath))
    }

    // The edge objects are this build's own, so a diagnosis is attached to the one it belongs to.
    const descend = (edge, recipePath) => {
        const {reference: {id}, role, path} = edge
        const targetPath = [...recipePath, id]
        const diagnosis = code => ({...diagnostic({code, role, path}), recipePath: targetPath})
        // Before the visited set and before any lookup: an ancestor is already expanded, so asking about
        // expansion first would answer "seen" and lose the cycle. The root is on every path, which is what
        // makes it win for its own id - an edge back to it is always this branch, never a lookup.
        if (recipePath.includes(id)) {
            edge.diagnostic = diagnosis(CYCLIC_DEPENDENCY)
            diagnostics.push(edge.diagnostic)
            return
        }
        if (expanded.has(id)) {
            return
        }
        if (absent.has(id)) {
            edge.diagnostic = diagnosis(MISSING_SOURCE)
            return
        }
        const recipe = recipesById.get(id)
        if (recipe) {
            expand(recipe, targetPath)
        } else {
            absent.add(id)
            edge.diagnostic = diagnosis(MISSING_SOURCE)
            diagnostics.push(edge.diagnostic)
        }
    }

    expand(rootRecipe, [rootRecipe.id])
    return {recipes, edges, diagnostics, recipeDiagnostics}
}
