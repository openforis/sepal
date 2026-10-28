import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

// The recipe layer sources found to name a recipe that no longer exists, as the component reading each found it
// (recipeImageLayerSource.jsx), whether or not a map area shows them: of the sources the recipe's layout lists, as
// assembled (withLayers.jsx). A mark is kept for the session only, under the recipe's view state, with the recipe it is
// about: a source naming another recipe since, or no longer listed, is not marked.

export const missingMarkPath = sourceId => ['ui.missingImageLayerSources', sourceId]

export const missingImageLayerSources = (recipe, imageLayerSources = []) => {
    const marks = selectFrom(recipe, 'ui.missingImageLayerSources') || {}
    return imageLayerSources
        .filter(({id, type, sourceConfig = {}}) =>
            type === 'Recipe' && sourceConfig.recipeId && marks[id]?.recipeId === sourceConfig.recipeId
        )
}

// What a missing source's mark says: the recipe it names, by what the source is called where it is listed.
export const missingSourceMessage = ({sourceConfig: {recipeId}}, description) =>
    msg('imageLayerSources.Recipe.notFound', {description: description || recipeId})
