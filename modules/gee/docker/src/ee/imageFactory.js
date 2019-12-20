const factory = {
    'MOSAIC': () => require('@sepal/ee/optical/mosaic'),
    'RADAR_MOSAIC': () => require('@sepal/ee/radar/mosaic'),
    'CLASSIFICATION': () => require('@sepal/ee/classification/classification'),
    'RECIPE_REF': () => require('@sepal/ee/recipeRef'),
    'ASSET': () => require('@sepal/ee/asset')
}

const getImplementation = type => {
    if (!factory[type]) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    const implementation = factory[type]()
    return (...args) => implementation(...args)
}

module.exports = (recipe, ...args) =>
    getImplementation(recipe.type)(recipe, ...args)
