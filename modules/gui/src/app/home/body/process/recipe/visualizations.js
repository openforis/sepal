import {selectFrom} from '~/stateUtils'

import {getRecipeType} from '../recipeTypeRegistry'
import {renderableVisualizations} from './visualizationMatching'

export const getUserDefinedVisualizations = (recipe, sourceId) =>
    Object.values(
        selectFrom(recipe, ['layers.userDefinedVisualizations', sourceId]) || []
    ).flat()

// The layer a recipe's own output is shown on. Styles filed under any other id belong to another input
// layer - a mask, a second image - and describe that layer, not this recipe's output.
export const OUTPUT_LAYER_ID = 'this-recipe'

// Everything a recipe says about its own output: the presets its type derives from its model, and the
// styles the user made for that output. One rule, used wherever a consuming recipe takes visualizations
// from another - so a style someone made on Band Math is offered by a Masking recipe over it, exactly as
// the presets are.
//
// Unfiltered on purpose. Which of these can actually be drawn depends on the consumer's own output, and an
// asset's CCDC templates are evidence for a transformation rather than styles for the image carrying them;
// deciding that here would delete them from every consumer instead of withholding them from one offer.
export const sourceVisualizations = (recipe, evidence) => [
    ...outputOwnedVisualizations(recipe),
    ...(getRecipeType(recipe.type)?.getPreSetVisualizations(recipe, evidence) || [])
]

// Owned by the recipe that made them, offered by whoever consumes its output. `userDefined` is what the
// selector reads to decide between editing a style and cloning one, and a consumer may do neither to a
// style it does not own - so it is dropped on the way out, while the identity is kept.
export const outputOwnedVisualizations = recipe =>
    getUserDefinedVisualizations(recipe, OUTPUT_LAYER_ID)
        .map(({userDefined: _userDefined, ...visParams}) => visParams)

export const getAllVisualizations = recipe => {
    const recipeType = getRecipeType(recipe.type)
    const availableBands = recipeType.getAvailableBands(recipe) || {}
    const userDefinedVisualizations = getUserDefinedVisualizations(recipe, OUTPUT_LAYER_ID)
    const preSetVisualizations = recipeType.getPreSetVisualizations(recipe)
    return renderableVisualizations([
        ...userDefinedVisualizations,
        ...preSetVisualizations
    ], availableBands)
}
