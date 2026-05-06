const registry = {}

export const addRecipeVisualizationOptions = (type, fn) =>
    registry[type] = fn

export const getRecipeVisualizationOptions = type =>
    registry[type]
