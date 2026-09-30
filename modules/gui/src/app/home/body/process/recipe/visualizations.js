import {selectFrom} from '~/stateUtils'

import {getRecipeType} from '../recipeTypeRegistry'
import {canPreview} from './recipeOutput'
import {reconciledSelection, renderableVisualizations, visualizationsWithAvailableBands} from './visualizationMatching'

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

// What a recipe offers for its own output that can be drawn from the given bands: the styles the user made for it
// and the presets its type derives. The bands are the caller's answer about that output - a layer's read, the
// names an input workflow observed - and are never looked up here.
export const recipeVisualizations = (recipe, availableBands) =>
    renderableVisualizations([
        ...getUserDefinedVisualizations(recipe, OUTPUT_LAYER_ID),
        ...(getRecipeType(recipe.type)?.getPreSetVisualizations(recipe) || [])
    ], availableBands || {})

// What a recipe offers for its own output that names only the given bands, matched by name alone: what a workflow
// copying presets from a source it observed, or deriving templates from a catalogue, carries on to where the styles
// are drawn - and where the renderer's own filter decides what can be.
export const recipeVisualizationsNaming = (recipe, bandNames) =>
    visualizationsWithAvailableBands([
        ...getUserDefinedVisualizations(recipe, OUTPUT_LAYER_ID),
        ...(getRecipeType(recipe.type)?.getPreSetVisualizations(recipe) || [])
    ], bandNames || [])

// What a map layer's picker offers, in its order and under its filter: the styles the recipe holding the layer keeps
// for it, the styles the recipe it shows owns for its output, then the presets its form offers. The picker and the
// reconciler read this one list, so a reconciliation never replaces a style the picker offers, nor chooses one it
// does not.
export const layerVisualizations = ({currentRecipe, recipe, sourceId, presets, availableBands}) => {
    const userDefinedVisualizations = getUserDefinedVisualizations(currentRecipe, sourceId)
    return renderableVisualizations([
        ...userDefinedVisualizations,
        ...inheritedVisualizations({sourceRecipe: recipe, recipeId: currentRecipe?.id, userDefinedVisualizations}),
        ...presets
    ], availableBands || {})
}

// The styles a layer showing another recipe inherits from it. The recipe's own layer inherits nothing: there its styles
// are already the layer's own.
//
// A style the layer already holds under the same identity is left to the local one. Copies made by earlier versions
// share their upstream identity, and offering both puts two options with one value in the picker: whichever resolves
// first wins the selection, and the wrong one decides whether the style can be edited. The saved copy is what a
// selection has been naming, so it keeps the identity; nothing is deleted, and a style with no local copy is inherited.
export const inheritedVisualizations = ({sourceRecipe, recipeId, userDefinedVisualizations}) => {
    if (!sourceRecipe || sourceRecipe.id === recipeId) {
        return []
    }
    const localIds = new Set(userDefinedVisualizations.map(({id}) => id))
    return outputOwnedVisualizations(sourceRecipe)
        .filter(({id}) => !localIds.has(id))
}

// The styles in a form's grouped preset options, in the order it offers them.
export const presetVisualizations = options =>
    options.flatMap(option => option.options
        ? presetVisualizations(option.options)
        : [option.visParams]
    )

// The selection a map layer writes, or undefined to write nothing. Nothing is chosen until the recipe is set up and
// the layer's answer could be previewed: a recipe being set up can still change its output, and bands may be known
// while dependencies are still being acquired or have failed, so readiness to preview is what is waited for, not band
// discovery. Until then the saved selection stays as it is.
export const layerSelection = ({recipe, imageOutput, visualizations, visParams}) =>
    recipe.ui?.initialized && canPreview(imageOutput)
        ? reconciledSelection({visualizations, visParams})
        : undefined
