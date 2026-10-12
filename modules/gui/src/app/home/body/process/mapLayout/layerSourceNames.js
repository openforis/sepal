import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {dotSafe} from '~/stateUtils'
import {select} from '~/store'

import {getImageLayerSource} from '../imageLayerSourceRegistry'

// Names the user gave the image layer sources the layout does not own - derived from the recipe's inputs, or kept from
// them - whose asset or recipe stays fixed. They are kept with the layout apart from its sources, keyed by source id, so
// naming a derived source saves no entry for it, and the name follows the source through assignment, input changes and
// saving.

// Asset ids may hold dots, so a source id is one path element.
export const layerSourceNamePath = sourceId => ['layers.imageLayerSourceNames', dotSafe(sourceId)]

export const layerSourceName = (recipe, sourceId) =>
    sourceId ? recipe?.layers?.imageLayerSourceNames?.[sourceId] : undefined

// What a source is called wherever it is listed or shown: the name it was given, else what its type calls it.
export const layerSourceDescription = ({recipe, source}) =>
    layerSourceName(recipe, source?.id) || getImageLayerSource({recipe, source}).description

export const renameLayerSource = ({recipeId, sourceId, name}) =>
    withLayerSourceName({action: recipeActionBuilder(recipeId)('RENAME_IMAGE_LAYER_SOURCE', {sourceId}), recipeId, sourceId, name})
        .dispatch()

// The name given in the same action as whatever else it builds. A blank name clears the one given, and the source is
// called what its type calls it again.
export const withLayerSourceName = ({action, recipeId, sourceId, name}) => {
    const trimmed = name?.trim()
    return trimmed
        ? action.set(layerSourceNamePath(sourceId), trimmed)
        : action.del(layerSourceNamePath(sourceId), !!layerSourceName(select(recipePath(recipeId)), sourceId))
}
