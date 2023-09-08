import {msg} from 'translate'

export const getPreSetVisualizations = recipe => {
    return recipe?.model?.assetDetails?.visualizations || []
}

export const visualizationOptions = recipe => {
    const visParamsToOption = visParams => ({
        value: visParams.bands.join(','),
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
