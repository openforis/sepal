const registry = {}

export const addRecipeImageLayer = (type, imageLayer) =>
    registry[type] = imageLayer

export const getRecipeImageLayer = type =>
    registry[type]
