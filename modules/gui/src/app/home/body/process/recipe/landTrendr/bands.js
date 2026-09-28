import _ from 'lodash'

import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {ANNUAL_MOSAIC} from '#sepal/recipe/type/landTrendr'
import {bandPresentation as opticalBandPresentation} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {msg} from '~/translate'

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

// The annual mosaic is an optical mosaic, and is shown as one.
export const bandPresentation = (_recipe, {name} = {}) => {
    switch (name) {
        case IMAGE_OUTPUT: return changeBands()
        case ANNUAL_MOSAIC: return opticalBandPresentation()
        default: return {}
    }
}

// The change map is the output; a layer may instead show the annual mosaic of the year it names.
export const mapProducts = {
    defaults: {visualizationType: 'changes'},
    productOf: ({visualizationType, year}) => {
        switch (visualizationType) {
            case 'changes': return {name: IMAGE_OUTPUT}
            case 'mosaics': return {name: ANNUAL_MOSAIC, parameters: {year}}
            default: return null
        }
    }
}

// The year a layer selects, within the period the series was fitted to: the stored year while it lies inside it, the
// nearest end otherwise, and the last fitted year when none is stored. A stored value that is not a year is left for
// the user to replace; the read refuses it. The product itself accepts any integer year - this is the layer's choice.
export const selectedYear = ({startYear, endYear}, year) => {
    if (year === undefined || year === null) {
        return endYear
    }
    return Number.isInteger(year)
        ? _.clamp(year, startYear, endYear)
        : year
}

// What a layer config must change to agree with its recipe's fitted period, whichever mode it shows - its mode's
// default where it has none, and its year - or null when nothing does, so an agreeing config is never written again.
export const layerConfigChanges = (dates, layerConfig = {}) => {
    const year = selectedYear(dates, layerConfig.year)
    const changes = {
        ...(layerConfig.visualizationType ? {} : mapProducts.defaults),
        ...(year === layerConfig.year ? {} : {year})
    }
    return _.isEmpty(changes) ? null : changes
}

// Mosaic bands are deliberately absent: they're plain annual composites,
// unrelated to the per-pixel change segment the change bands describe, and an
// Optical Mosaic recipe is the right way to export that imagery.
export const groupedBandPresentation = () => [
    Object.entries(changeBands()).map(([value, entry]) => ({value, ...entry}))
]
