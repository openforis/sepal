import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The recipe dependency graph behind an image layer's map invalidation.
//
// Adapts what the GUI holds - the root recipe and the plain `process.loadedRecipes` object keyed by id - to
// the shared traversal, which takes a Map. Nothing is loaded here: a dependency that is not already in memory
// is reported by the graph rather than fetched, because a map layer must not turn a render into a request.
//
// The graph is returned whole rather than reduced to a recipe list, but its diagnostics are INERT: nothing
// reads them, and nothing here may surface them or let them block rendering.
//
// MISSING_SOURCE in particular says only that a referenced recipe is not in `loadedRecipes` right now. That
// is a fact about what the session happens to have loaded, not about what exists: a perfectly healthy
// dependency the user has not opened produces it. Reporting it as a broken recipe would turn ordinary lazy
// loading into an error, and blocking the layer on it would stop maps rendering for recipes that are fine.
// Saying whether a dependency is genuinely gone needs a resolver that can ask storage, which this is not.

// Cached by IDENTITY, because the caller is a Redux selector: it runs on every dispatched action, not only on
// recipe edits, and rebuilding the catalogue and rewalking the graph for an unrelated action is pure waste.
//
// This is correct only because Redux state is immutable. A reducer that edited a recipe in place would leave
// both identities unchanged and this would serve a stale graph, so the invariant it rests on is that ANY
// change to a recipe produces a new `loadedRecipes` object, and a change to one recipe a new recipe object.
//
// Both identities participate, and they answer different questions. `loadedRecipes` decides whether the
// CATALOGUE is still current - one Map built once and shared by every layer on the screen, rather than
// rebuilt per layer. The root recipe decides whether one layer's GRAPH is still current, because a single
// catalogue serves as many roots as there are layers open against it.
//
// WeakMaps throughout, so a superseded Redux state and the recipes in it become collectable as soon as
// nothing else holds them.
const CATALOGUE_BY_LOADED_RECIPES = new WeakMap()

const catalogueOf = loadedRecipes => {
    const cached = CATALOGUE_BY_LOADED_RECIPES.get(loadedRecipes)
    if (cached) {
        return cached
    }
    const catalogue = {
        recipesById: new Map(Object.entries(loadedRecipes)),
        graphByRoot: new WeakMap()
    }
    CATALOGUE_BY_LOADED_RECIPES.set(loadedRecipes, catalogue)
    return catalogue
}

export const buildMapDependencyGraph = ({recipe, loadedRecipes}) => {
    if (!loadedRecipes) {
        return buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map()})
    }
    const {recipesById, graphByRoot} = catalogueOf(loadedRecipes)
    const cached = graphByRoot.get(recipe)
    if (cached) {
        return cached
    }
    const graph = buildRecipeDependencyGraph({rootRecipe: recipe, recipesById})
    graphByRoot.set(recipe, graph)
    return graph
}
