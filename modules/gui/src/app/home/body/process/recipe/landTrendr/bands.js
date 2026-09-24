import {getAvailableBands as opticalBands} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../legacyOutput'
import {toMosaicRecipe} from './mosaicRecipe'

const typeInt = {precision: 'int'}
const typeFloat = {precision: 'float'}

const changeBands = () => ({
    yod: {dataType: typeInt, label: msg('process.landTrendr.bands.yod')},
    mag: {dataType: typeFloat, label: msg('process.landTrendr.bands.mag')},
    dur: {dataType: typeInt, label: msg('process.landTrendr.bands.dur')},
    preval: {dataType: typeFloat, label: msg('process.landTrendr.bands.preval')},
    postval: {dataType: typeFloat, label: msg('process.landTrendr.bands.postval')},
    rmse: {dataType: typeFloat, label: msg('process.landTrendr.bands.rmse')},
    sig: {dataType: typeFloat, label: msg('process.landTrendr.bands.sig')}
})

const mosaicBands = recipe => opticalBands(toMosaicRecipe(recipe))

// Without a visualizationType the caller is asking what the layer might show at
// all - recipeImageLayer does this to build its dataTypes lookup - so it needs
// both modes, not whichever one happens to be the default.
export const getAvailableBands = (recipe, visualizationType) => {
    switch (visualizationType) {
        case 'changes': return changeBands()
        case 'mosaics': return mosaicBands(recipe)
        default: return {...changeBands(), ...mosaicBands(recipe)}
    }
}

// The change map is the output; a layer may instead show the annual mosaic it was fitted from.
export const mapProducts = {
    defaults: {visualizationType: 'changes'},
    productOf: ({visualizationType, year}) => {
        switch (visualizationType) {
            case 'changes': return {name: IMAGE_OUTPUT}
            case 'mosaics': return {name: 'ANNUAL_MOSAIC', parameters: {year}}
            default: return null
        }
    },
    bands: (recipe, {name}) => {
        switch (name) {
            case IMAGE_OUTPUT: return getAvailableBands(recipe, 'changes')
            case 'ANNUAL_MOSAIC': return getAvailableBands(recipe, 'mosaics')
            default: return undefined
        }
    }
}

// Mosaic bands are deliberately absent: they're plain annual composites,
// unrelated to the per-pixel change segment the change bands describe, and an
// Optical Mosaic recipe is the right way to export that imagery.
export const getGroupedBandOptions = () => {
    const availableBands = changeBands()
    return [
        Object.keys(availableBands).map(band => ({value: band, ...availableBands[band]}))
    ]
}
