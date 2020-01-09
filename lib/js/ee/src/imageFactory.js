const factory = {
    'MOSAIC': () => require('root/ee/optical/mosaic'),
    'RADAR_MOSAIC': () => require('root/ee/radar/mosaic'),
    'CLASSIFICATION': () => require('root/ee/classification/classification'),
    'RECIPE_REF': () => require('root/ee/recipeRef'),
    'ASSET': () => require('root/ee/asset')
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
