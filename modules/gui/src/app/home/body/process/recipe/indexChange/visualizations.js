import _ from 'lodash'

import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

export const getPreSetVisualizations = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage

    const difference = () => {
        const maxDiff = fromImage && toImage
            ? Math.max(fromImage.bandMax, toImage.bandMax) - Math.min(fromImage.bandMin, toImage.bandMin)
            : 5000
        return normalize({
            type: 'continuous',
            bands: ['difference'],
            min: -maxDiff / 2,
            max: maxDiff / 2,
            palette: '#a50026, #d73027, #f46d43, #fdae61, #ffffff, #a6d96a, #66bd63, #1a9850, #006837'
        })
    }

    const normalizedDifference = () => {
        return normalize({
            type: 'continuous',
            bands: ['normalized_difference'],
            min: -1,
            max: 1,
            palette: '#a50026, #d73027, #f46d43, #fdae61, #ffffff, #a6d96a, #66bd63, #1a9850, #006837'
        })
    }

    const ratio = () => {
        return normalize({
            type: 'continuous',
            bands: ['ratio'],
            min: -10,
            max: 10,
            palette: '#000000, #a50026, #d73027, #f46d43, #fdae61, #ffffff, #a6d96a, #66bd63, #1a9850, #006837'
        })
    }

    const error = () => {
        const maxError = fromImage && toImage
            ? Math.max(fromImage.errorBandMax, toImage.errorBandMax)
             || (Math.max(fromImage.bandMax, toImage.bandMax) - Math.min(fromImage.bandMin, toImage.bandMin)) / 2
            : 2000
        return normalize({
            type: 'continuous',
            bands: ['error'],
            min: 0,
            max: maxError,
            palette: '#006837, #1a9850, #66bd63, #a6d96a, #d9ef8b, #ffffbf, #fee08b, #fdae61, #f46d43, #d73027, #a50026'
        })
    }

    const confidence = () => {
        return normalize({
            type: 'continuous',
            bands: ['confidence'],
            min: 0,
            max: 10,
            palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00',
                '#79C900', '#006400']
        })
    }

    const legend = selectFrom(recipe, 'model.legend') || {}
    const entries = _.sortBy(legend.entries, 'value') || []

    const hasDifference = fromImage && toImage
    const hasLegend = hasDifference && entries.length
    const hasError = selectFrom(fromImage, 'errorBand') && selectFrom(toImage, 'errorBand')

    const change = () => {
        const min = entries[0].value
        const max = _.last(entries).value
        return normalize({
            type: 'categorical',
            bands: ['change'],
            min,
            max,
            values: entries.map(({value}) => value),
            labels: entries.map(({label}) => label),
            palette: entries.map(({color}) => color)
        })
    }
    return [
        hasDifference ? [difference()] : [],
        hasDifference ? [normalizedDifference()] : [],
        hasDifference ? [ratio()] : [],
        hasLegend ? [change()] : [],
        hasError ? [error()] : [],
        hasError ? [confidence()] : []
    ].flat()
}
