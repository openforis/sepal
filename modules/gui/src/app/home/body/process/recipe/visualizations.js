import {getRecipeType} from '../recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'

export const getAllVisualizations = recipe => {
    const recipeType = getRecipeType(recipe.type)
    const availableBands = recipeType.getAvailableBands(recipe) || {}
    const userDefinedVisualizations = Object.values(
        (selectFrom(recipe, ['layers.userDefinedVisualizations.this-recipe']) || [])
    )
    const preSetVisualizations = recipeType.getPreSetVisualizations(recipe)
    return [
        ...userDefinedVisualizations,
        ...preSetVisualizations
    ].filter(({bands}) => bands.every(band => Object.keys(availableBands).includes(band)))
}

export const getUserDefinedVisualizations = (recipe, sourceId) => {
    return Object.values(
        selectFrom(recipe, ['layers.userDefinedVisualizations', sourceId]) || []
    ).flat()
}
