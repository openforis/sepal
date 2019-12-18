const factory = {
    'MOSAIC': (...args) => require('@sepal/ee/optical/mosaic')(...args),
    'RADAR_MOSAIC': (...args) => require('@sepal/ee/radar/mosaic')(...args),
}

module.exports = (recipe, ...args) =>
    getImplementation(recipe.type)(recipe, ...args)

const getImplementation = type => {
    const implementation = factory[type]
    if (!implementation) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    return implementation
}
