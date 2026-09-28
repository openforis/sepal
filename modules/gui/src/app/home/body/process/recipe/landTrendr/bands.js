import {getAvailableBands as opticalBands} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../legacyOutput'
import {toMosaicRecipe} from './mosaicRecipe'

const typeInt = {precision: 'int'}
const typeFloat = {precision: 'float'}

// How the change result's bands are shown; which of them exist is its declaration's to say.
const changeBands = () => ({
    yod: {dataType: typeInt, label: msg('process.landTrendr.bands.yod')},
    mag: {dataType: typeFloat, label: msg('process.landTrendr.bands.mag')},
    dur: {dataType: typeInt, label: msg('process.landTrendr.bands.dur')},
    preval: {dataType: typeFloat, label: msg('process.landTrendr.bands.preval')},
    postval: {dataType: typeFloat, label: msg('process.landTrendr.bands.postval')},
    rmse: {dataType: typeFloat, label: msg('process.landTrendr.bands.rmse')},
    sig: {dataType: typeFloat, label: msg('process.landTrendr.bands.sig')}
})

export const bandPresentation = (_recipe, {name} = {}) =>
    name === IMAGE_OUTPUT ? changeBands() : {}

const mosaicBands = recipe => opticalBands(toMosaicRecipe(recipe))

// The change map is the output; a layer may instead show the annual mosaic it was fitted from, which has not yet
// been declared and is answered here.
export const mapProducts = {
    defaults: {visualizationType: 'changes'},
    productOf: ({visualizationType, year}) => {
        switch (visualizationType) {
            case 'changes': return {name: IMAGE_OUTPUT}
            case 'mosaics': return {name: 'ANNUAL_MOSAIC', parameters: {year}}
            default: return null
        }
    },
    bands: (recipe, {name}) =>
        name === 'ANNUAL_MOSAIC' ? mosaicBands(recipe) : undefined
}

// Mosaic bands are deliberately absent: they're plain annual composites,
// unrelated to the per-pixel change segment the change bands describe, and an
// Optical Mosaic recipe is the right way to export that imagery.
export const groupedBandPresentation = () => [
    Object.entries(changeBands()).map(([value, entry]) => ({value, ...entry}))
]
