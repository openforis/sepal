import {normalize} from '~/app/home/map/visParams/visParams'

import {getAvailableBands} from './bands'

export const getPreSetVisualizations = recipe => {
    const availableBands = getAvailableBands()
    return visualizations(recipe.model.dates)
        .filter(({bands}) => bands.every(band => availableBands[band]))
}

const visualizations = ({startYear, endYear}) => [
    normalize({
        type: 'continuous',
        bands: ['mag'],
        min: [-3000],
        max: [3000],
        // ColorBrewer RdYlGn (reversed: green = gain, red = loss)
        palette: '#006837, #1a9850, #66bd63, #a6d96a, #d9ef8b, #ffffbf, #fee08b, #fdae61, #f46d43, #d73027, #a50026'
    }),
    normalize({
        type: 'continuous',
        bands: ['yod'],
        min: [startYear],
        max: [endYear],
        palette: '#2166AC, #67A9CF, #D1E5F0, #FDDBC7, #EF8A62, #B2182B'
    }),
    normalize({
        type: 'continuous',
        bands: ['dur'],
        min: [1],
        max: [10],
        palette: '#FFFFCC, #41B6C4, #225EA8'
    }),
    normalize({
        type: 'continuous',
        bands: ['preval'],
        min: [0],
        max: [10000],
        palette: '#EDF8B1, #7FCDBB, #2C7FB8'
    }),
    normalize({
        type: 'continuous',
        bands: ['postval'],
        min: [0],
        max: [10000],
        palette: '#EDF8B1, #7FCDBB, #2C7FB8'
    }),
    normalize({
        type: 'rgb',
        bands: ['startRed', 'startGreen', 'startBlue'],
        min: [200, 400, 600],
        max: [2400, 2200, 2400],
        gamma: [1.2, 1.2, 1.2]
    }),
    normalize({
        type: 'rgb',
        bands: ['endRed', 'endGreen', 'endBlue'],
        min: [200, 400, 600],
        max: [2400, 2200, 2400],
        gamma: [1.2, 1.2, 1.2]
    })
]
