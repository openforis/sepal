import {getRecipeType} from '../recipeTypes'
import {selectFrom} from 'stateUtils'

export const getAllVisualizations = (recipe, sourceId = 'this-recipe') => {
    const recipeType = getRecipeType(recipe.type)
    const availableBands = recipeType.getAvailableBands(recipe)
    const userDefinedVisualizations = Object.values(
        (selectFrom(recipe, ['layers.userDefinedVisualizations', sourceId]) || [])
    )
    const preSetVisualizations = recipeType.getPreSetVisualizations(recipe)
    return [
        ...userDefinedVisualizations,
        ...preSetVisualizations
    ].filter(({bands}) => bands.every(band => Object.keys(availableBands).includes(band)))
}
