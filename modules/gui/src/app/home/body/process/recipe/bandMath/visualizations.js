export const getPreSetVisualizations = recipe => {
    return recipe.model.inputImagery?.images
        .map(image => updateVisualizations(recipe, image))
        .flat()
}

export const visualizationOptions = (recipe, recipeNameById) => {
    const vis = recipe.model.inputImagery?.images
        .map(image => {
            const label = image.type === 'RECIPE_REF'
                ? recipeNameById[image.id]
                : image.id
            const visParamsToOption = visParams => {
                const value = visParams.bands.join(', ')
                return {value, label: value, visParams}
            }
            const options = updateVisualizations(recipe, image)
                .map(visParamsToOption)
            return {label, options}
        })
    return vis
}

const updateVisualizations = (recipe, image) => {
    const visualizations = image.visualizations
    if (!visualizations) {
        return []
    } else {
        const bands = recipe.model.outputBands.outputImages
            .find(({imageId}) => imageId === image.imageId)
            ?.outputBands || []
        return visualizations
            .map(visualization => updateVisualization(visualization, bands))
            .filter(visualization => visualization)
    }
}

// A band the user has not renamed is called by its default name, which is what getAvailableBands reports
// and what the output actually carries. Reading only `outputName` dropped every visualization over a band
// nobody had renamed - which is most of them.
//
// A band the output does not have is still absent: an input style over `ratio_VV_VH` names nothing this
// image produces, and the calculated `ratio` is a different band, never a substitute for it.
const updateVisualization = (visualization, bands) => {
    const outputBands = visualization.bands
        .map(band => {
            const outputBand = bands.find(({name}) => name === band)
            return outputBand && (outputBand.outputName || outputBand.defaultOutputName)
        })
    const containsAllBands = outputBands.every(band => band)
    if (containsAllBands) {
        return {...visualization, bands: outputBands}
    } else {
        return null
    }
}
