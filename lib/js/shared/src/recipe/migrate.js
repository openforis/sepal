const _ = require('lodash')

const migrate = recipe => {
    switch(recipe.type) {
        case 'MOSAIC': return migrateOpticalMosaic(recipe)
        default: return recipe
    }
}

const migrateOpticalMosaic = recipe => {
    const sources = recipe.model.sources
    if (sources && !sources.dataSets) {
        const migratedRecipe = _.cloneDeep(recipe)
        migratedRecipe.model.sources = {
            dataSets: sources,
            cloudPercentageThreshold: 100
        }
        return migratedRecipe
    }
    return recipe
}

module.exports = {migrate}
