import moment from 'moment'

export const getOutputPath = ({destination, retrieveOptions, recipe}) => {
    switch (destination) {
        case 'GEE':
            return retrieveOptions.assetId
        case 'SEPAL':
            return retrieveOptions.workspacePath
        case 'DRIVE': {
            const description = recipe.title || recipe.placeholder
            return `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`

        }
        default:
            return null
    }
}

export const getTaskInfo = ({recipe, destination, retrieveOptions}) => {
    const outputPath = getOutputPath({destination, retrieveOptions, recipe})
    
    return {
        recipeType: recipe.type,
        destination,
        outputPath,
        sharing: retrieveOptions.sharing,
        filenamePrefix: retrieveOptions.filenamePrefix
    }
}
