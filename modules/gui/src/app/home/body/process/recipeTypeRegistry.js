const registry = []

// Every registration states whether its recipes are offered as images by the pickers that offer recipes as images -
// input imagery, a map layer's source, an area of interest. That is eligibility for those pickers, stated per type
// apart from what the type declares it outputs; it proves nothing about whether a recipe can be executed, and a type's
// capabilities, such as segments or historical statistics, are asked of separately.
export const addRecipeType = recipeType => {
    if (typeof recipeType?.imageSource !== 'boolean') {
        throw new Error(`Recipe type ${recipeType?.id} must state whether it is an image source`)
    }
    registry.push(recipeType)
}

export const listRecipeTypes = () =>
    registry

export const getRecipeType = id =>
    registry.find(recipeType => recipeType.id === id)

export const isImageSource = recipeType =>
    recipeType.imageSource
