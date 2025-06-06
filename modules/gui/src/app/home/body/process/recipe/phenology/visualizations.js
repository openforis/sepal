import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'

export const getPreSetVisualizations = recipe => {
    const availableBands = getAvailableBands(recipe)
    return Object.values(visualizations).flat()
        .filter(({bands}) => bands.every(band => availableBands[band]))
}

export const visualizationOptions = _recipe => {
    const visParamsToOption = visParams => ({
        value: visParams.bands.join(','),
        label: visParams.bands.join(', '),
        visParams
    })
    const bandCombinationOptions = {
        label: msg('process.mosaic.bands.combinations'),
        options: visualizations.BASE.map(visParamsToOption)
    }
    const monthOptions = {
        label: msg('process.mosaic.bands.months'),
        options: visualizations.MONTHS.map(visParamsToOption)
    }
    return [bandCombinationOptions, monthOptions]
}

export const visualizations = {
    BASE: [
        normalize({
            type: 'hsv',
            bands: ['dayOfYear_2', 'days_1', 'slope_2'],
            min: [1, 10, -30],
            max: [365, 200, 70]
        }),
        normalize({
            type: 'rgb',
            bands: ['median', 'background', 'amplitude'],
            min: [500, 0, 500],
            max: [3500, 3000, 3500]
        }),
        normalize({
            type: 'rgb',
            bands: ['days_1', 'days_2', 'days_4'],
            min: 1,
            max: 200
        }),
        normalize({
            bands: ['median_1', 'median_2', 'median_4'],
            min: [500, 500, 500],
            max: [3000, 4000, 3000]
        }),
        normalize({
            bands: ['slope_1', 'slope_2', 'slope_4'],
            min: -30,
            max: 70
        })
    ],
    MONTHS: [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december']
        .map(month =>
            normalize({
                type: 'continuous',
                bands: [month],
                min: [-10000],
                max: [10000],
                palette: '#112040, #1C67A0, #6DB6B3, #FFFCCC, #ABAC21, #177228, #172313'
            }))
}
