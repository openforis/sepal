import {msg} from '~/translate'

export const getPreSetVisualizations = recipe => {
    return recipe?.model?.assetDetails?.visualizations || []
}

export const visualizationOptions = recipe => {
    // Identified as the picker resolves a selection: by preset id, or by bands for a preset saved without one.
    const visParamsToOption = visParams => ({
        value: visParams.id || visParams.bands.join(','),
        label: visParams.bands.join(', '),
        visParams
    })
    return [
        {
            label: msg('process.asset.layers.imageLayer.preSets'),
            options: getPreSetVisualizations(recipe).map(visParamsToOption)
        }
    ]
}

export const visualizations = {
}
