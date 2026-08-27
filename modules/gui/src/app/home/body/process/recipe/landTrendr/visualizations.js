import {visualizationOptions as opticalVisualizationOptions} from '~/app/home/body/process/recipe/opticalMosaic/visualizations'
import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {toMosaicRecipe} from './mosaicRecipe'

// Registered on the recipe type, so it feeds the visualization properties
// attached to exports - which only ever contain change bands.
export const getPreSetVisualizations = recipe => {
    const availableBands = getAvailableBands(recipe, 'changes')
    return changeVisualizations(recipe.model.dates)
        .filter(({bands}) => bands.every(band => availableBands[band]))
}

export const visualizationOptions = (recipe, visualizationType) =>
    visualizationType === 'mosaics'
        ? opticalVisualizationOptions(toMosaicRecipe(recipe))
        : changeVisualizationOptions(recipe)

const changeVisualizationOptions = recipe => {
    const availableBands = getAvailableBands(recipe, 'changes')
    return [{
        label: msg('process.landTrendr.layers.imageLayer.preSets'),
        options: getPreSetVisualizations(recipe).map(visParams => {
            const band = visParams.bands[0]
            return {value: band, label: availableBands[band].label, visParams}
        })
    }]
}

const changeVisualizations = ({startYear, endYear}) => [
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
        dataType: 'year',
        min: [startYear],
        max: [endYear],
        // Tol rainbow (same palette used for date/year bands elsewhere,
        // e.g. changeAlerts/ccdcSlice)
        palette: '#781C81, #3F60AE, #539EB6, #6DB388, #CAB843, #E78532, #D92120'
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
        // Full ±10000 range: index bands are on the ×10000 int16 scale, and
        // several selectable indices (nbr, ndwi, ndbi, ui, ...) legitimately
        // run negative, e.g. NBR over burn scars, water, or bare soil.
        min: [-10000],
        max: [10000],
        palette: '#EDF8B1, #7FCDBB, #2C7FB8'
    }),
    normalize({
        type: 'continuous',
        bands: ['postval'],
        min: [-10000],
        max: [10000],
        palette: '#EDF8B1, #7FCDBB, #2C7FB8'
    }),
    normalize({
        type: 'continuous',
        bands: ['rmse'],
        min: [0],
        max: [1000],
        palette: '#EDF8B1, #7FCDBB, #2C7FB8'
    }),
    normalize({
        type: 'continuous',
        bands: ['sig'],
        // Magnitude in multiples of the fit RMSE; ~1-3 is the interesting
        // range, beyond ~10 everything is unambiguous.
        min: [0],
        max: [10],
        palette: '#000000, #480000, #710101, #BA0000, #FF0000, #FFA500, #FFFF00, #79C900, #006400'
    })
]
