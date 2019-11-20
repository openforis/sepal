const factory = {
    'MOSAIC': (...args) => require('./opticalMosaic')(...args),
    'CLASSIFICATION': (...args) => require('./classification')(...args)
}

module.exports = (recipe, ...args) =>
    getImplementation(recipe.type)(recipe, ...args)

const getImplementation = type => {
    const implementation = factory[type]
    if (!implementation ) {
        throw new Error(`Unsupported recipe type: ${type}`)
    }
    return implementation
}
