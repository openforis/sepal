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
    const expanded = new Set()
    const absent = new Set()

    const isRecipeEdge = ({reference}) => reference.type === RECIPE_REF

    const expand = (recipe, recipePath) => {
        expanded.add(recipe.id)
        recipes.push(recipe)
        const direct = directSourceEdges(recipe)
        // Every direct edge is appended before any descent, so edges stay grouped by the recipe that declared
        // them and their order cannot depend on how deep a subtree happens to be.
        direct.edges.forEach(edge => edges.push({sourceRecipeId: recipe.id, ...edge}))
        direct.diagnostics.forEach(directDiagnostic => diagnostics.push({...directDiagnostic, recipePath}))
        direct.edges.filter(isRecipeEdge).forEach(edge => descend(edge, recipePath))
    }

    const descend = ({reference: {id}, role, path}, recipePath) => {
        const targetPath = [...recipePath, id]
        // Before the visited set and before any lookup: an ancestor is already expanded, so asking about
        // expansion first would answer "seen" and lose the cycle. The root is on every path, which is what
        // makes it win for its own id - an edge back to it is always this branch, never a lookup.
        if (recipePath.includes(id)) {
            diagnostics.push({...diagnostic({code: CYCLIC_DEPENDENCY, role, path}), recipePath: targetPath})
            return
        }
        if (expanded.has(id) || absent.has(id)) {
            return
        }
        const recipe = recipesById.get(id)
        if (recipe) {
            expand(recipe, targetPath)
        } else {
            absent.add(id)
            diagnostics.push({...diagnostic({code: MISSING_SOURCE, role, path}), recipePath: targetPath})
        }
    }

    expand(rootRecipe, [rootRecipe.id])
    return {recipes, edges, diagnostics}
}
