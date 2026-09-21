import {map} from 'rxjs'

import {
    createImageOutputObserver,
    settledImageOutput$ as settledOutput$
} from '#sepal/recipe/output/observeImageOutput'
import {AVAILABLE_BANDS} from '#sepal/recipe/output/provider'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {ASSET} from '#sepal/recipe/source/reference'
import api from '~/apiRegistry'

// The GUI binding for the shared image-output observer: how this runtime asks Earth Engine for band evidence,
// where declarations live, and how `loadedRecipes` becomes a graph. State, resolution, deduplication,
// cancellation and diagnostics belong to the observer; errors pass through untranslated.
//
// Not `buildMapDependencyGraph`: that is selector-cached and owned by map invalidation, which runs on every
// dispatched action. This observes only on an explicit command.

// An asset is addressed by id, while a recipe is sent whole, because /bands evaluates the recipe rather than
// looking one up. Without data types /bands answers from what the recipe says it can be asked for, and with
// them from the image it builds when asked for nothing - the two questions `observes` distinguishes. A
// producer that answers the first supplies its own physical facts, so only names come back.
const acquisition = {
    observeBands$: ({reference, recipe, observes}) => reference.type === ASSET
        ? api.gee.bands$({asset: reference.id, includeDataTypes: true})
        : observes === AVAILABLE_BANDS
            ? api.gee.bands$({recipe}).pipe(map(bandNames => bandNames.map(name => ({name}))))
            : api.gee.bands$({recipe, includeDataTypes: true}),
    declarationFor: recipe => recipeType(recipe.type)?.imageOutput
}

export const createRecipeImageOutputObserver = () => {
    const observer = createImageOutputObserver(acquisition)

    return {
        state$: observer.state$,
        // The root is passed separately from the catalogue and need not be in it: a recipe being edited is the
        // graph's root before it is anything the session has loaded.
        observe: ({graph, recipe, loadedRecipes}) => observer.observe(graph || buildRecipeDependencyGraph({
            rootRecipe: recipe,
            recipesById: new Map(Object.entries(loadedRecipes || {}))
        })),
        cancel: observer.cancel
    }
}

export const settledImageOutput$ = graph => settledOutput$({graph, ...acquisition})
