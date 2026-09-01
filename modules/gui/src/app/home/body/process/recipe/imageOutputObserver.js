import {createImageOutputObserver} from '#sepal/recipe/output/observeImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {ASSET} from '#sepal/recipe/source/reference'
import api from '~/apiRegistry'

// The GUI binding for the shared runtime image-output observer.
//
// Thin by construction. It adapts three things the shared observer cannot know about - the `loadedRecipes`
// shape, where declarations live, and how this runtime asks Earth Engine for normalized band evidence - and
// delegates state, resolution, deduplication, cancellation and diagnostics to the observer itself.
//
// Not `buildMapDependencyGraph`: that is selector-cached and owned by map invalidation, which runs on every
// dispatched action. This observes only on an explicit command, so it adapts `loadedRecipes` directly rather
// than adding a second cache to code that already documents why it has one.
//
// Declarations come from the shared registry alone. A GUI-side registry, type switch or compatibility list
// would be a second answer to a question the shared definition already answers.
//
// Errors are passed through untouched. Translation, notification, logging and retry are consumer concerns,
// and the shared observer already retains a failed observation as runtime UNAVAILABLE state.
//
// The root is passed separately from the catalogue and need not be in it: a recipe being edited is the graph's
// root before it is anything the session has loaded.

export const createRecipeImageOutputObserver = () => {
    const observer = createImageOutputObserver({
        // The only place this runtime's execution boundary appears. An asset is addressed by id, while a
        // recipe is sent whole, because /bands evaluates the recipe rather than looking one up.
        observeBands$: ({reference, recipe}) => reference.type === ASSET
            ? api.gee.bands$({asset: reference.id, includeDataTypes: true})
            : api.gee.bands$({recipe, includeDataTypes: true}),
        declarationFor: recipe => recipeType(recipe.type)?.imageOutput
    })

    return {
        state$: observer.state$,
        observe: ({graph, recipe, loadedRecipes}) => observer.observe(graph || buildRecipeDependencyGraph({
            rootRecipe: recipe,
            recipesById: new Map(Object.entries(loadedRecipes || {}))
        })),
        cancel: observer.cancel
    }
}
