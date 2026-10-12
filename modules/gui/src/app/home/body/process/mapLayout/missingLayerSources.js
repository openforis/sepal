import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

// The recipe layer sources found to name a recipe that no longer exists, as the component reading each found it
// (recipeImageLayerSource.jsx), whether or not a map area shows them. A mark is kept for the session only, under the
// recipe's view state, with the recipe it is about: a source naming another recipe since, or removed, is not marked.

export const missingMarkPath = sourceId => ['ui.missingImageLayerSources', sourceId]

export const missingImageLayerSources = recipe => {
    const marks = selectFrom(recipe, 'ui.missingImageLayerSources') || {}
    return (selectFrom(recipe, 'layers.additionalImageLayerSources') || [])
        .filter(({id, type, sourceConfig = {}}) =>
            type === 'Recipe' && sourceConfig.recipeId && marks[id]?.recipeId === sourceConfig.recipeId
        )
}

// What a missing source's mark says: the recipe it names, as the source was saved.
export const missingSourceMessage = ({sourceConfig: {recipeId, description}}) =>
    msg('imageLayerSources.Recipe.notFound', {description: description || recipeId})
