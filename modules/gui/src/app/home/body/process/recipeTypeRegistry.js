const registry = []

export const addRecipeType = recipeType =>
    registry.push(recipeType)

export const listRecipeTypes = () =>
    registry
    
export const getRecipeType = id =>
    registry.find(recipeType => recipeType.id === id)
