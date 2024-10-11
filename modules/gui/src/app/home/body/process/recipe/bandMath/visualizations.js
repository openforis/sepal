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

const updateVisualization = (visualization, bands) => {
    const outputBands = visualization.bands
        .map(band => bands
            .find(({name}) => name === band)?.outputName
        )
    const containsAllBands = outputBands.every(band => band)
    if (containsAllBands) {
        return {...visualization, bands: outputBands}
    } else {
        return null
    }
}
