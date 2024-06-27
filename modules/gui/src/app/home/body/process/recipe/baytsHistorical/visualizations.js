import {normalize} from '~/app/home/map/visParams/visParams'

import {getAvailableBands} from './bands'

export const getPreSetVisualizations = recipe => {
    const availableBands = getAvailableBands(recipe)
    return visualizations.filter(
        ({bands}) => bands.every(band => availableBands[band])
    )
}

export const visualizationOptions = recipe => {
    const visParamsToOption = visParams => ({
        value: visParams.bands.join(','),
        label: visParams.bands.join(', '),
        visParams
    })
    const availableBands = getAvailableBands(recipe)
    return visualizations
        .filter(
            ({bands}) => bands.every(band => availableBands[band])
        )
        .map(visParamsToOption)
}

export const visualizations = [
    normalize({
        type: 'rgb',
        bands: ['VV_mean_asc', 'VH_mean_asc', 'VV_std_asc'],
        min: [-20, -25, 0],
        max: [0, -5, 5]
    }),
    normalize({
        type: 'rgb',
        bands: ['VV_mean_desc', 'VH_mean_desc', 'VV_std_desc'],
        min: [-20, -25, 0],
        max: [0, -5, 5]
    }),

]
