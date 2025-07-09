import Color from 'color'
import _ from 'lodash'
import React from 'react'

import {sequence} from '~/array'
import {withContext} from '~/context'

import {selectFrom} from '../../../stateUtils'

const Context = React.createContext()

export const CursorValueContext = ({cursorValue$, children}) =>
    <Context.Provider value={cursorValue$}>
        {children}
    </Context.Provider>

export const withCursorValue = withContext(Context, 'cursorValue$')

export const toBandValues = (rgb, visParams, dataTypes) => {
    const inverted = visParams.inverted || visParams.bands.map(() => false)
    const min = inverted
        .map((inverted, i) => inverted ? visParams.max[i] : visParams.min[i])
    const max = inverted
        .map((inverted, i) => inverted ? visParams.min[i] : visParams.max[i])
    const {type} = visParams
    switch (type) {
        case 'continuous': return toContinuous(rgb, {...visParams, min, max}, dataTypes)
        case 'categorical': return toCategorical(rgb, visParams, dataTypes)
        case 'rgb': return toRgb(rgb, {...visParams, min, max}, dataTypes)
        case 'hsv': return toHsv(rgb, {...visParams, min, max}, dataTypes)
        default: return []
    }
}

const toRgb = (rgb, visParams, dataTypes) => {
    const {min, max, gamma = 1} = visParams
    return rgb
        .map((c, i) => 255 * Math.pow(c / 255, gamma[i]))
        .map((c, i) => min[i] + c * (max[i] - min[i]) / 255)
        .map((v, i) => {
            return selectFrom(dataTypes, [visParams.bands[i], 'precision']) === 'int'
                ? Math.round(parseFloat(v))
                : parseFloat(v)
        }
        )
}

const toHsv = (rgb, {bands, min, max, gamma = 1}, dataTypes) => {
    const correctedRgb = rgb.map((c, i) => 255 * Math.pow(c / 255, gamma[i]))
    const hsv = Color.rgb(correctedRgb).hsv().color
    const normalizedHsv = [hsv[0] / 360, hsv[1] / 100, hsv[2] / 100]
    return normalizedHsv
        .map((v, i) =>
            min[i] + normalizedHsv[i] * (max[i] - min[i])
        )
        .map((v, i) => {
            return selectFrom(dataTypes, [bands[i], 'precision']) === 'int'
                ? Math.round(parseFloat(v))
                : parseFloat(v)
        })
}

const toCategorical = (rgb, visParams, dataTypes) => {
    const paddedPalette = sequence(visParams.min, visParams.max).map(() => '#000000')
    visParams.values.forEach((value, i) => {
        paddedPalette[value - visParams.min] = visParams.palette[i]
    })
    const continuous = toContinuous(rgb, {...visParams, palette: paddedPalette}, dataTypes)
    if (continuous.length && visParams.values) {
        return [_.minBy(visParams.values, value => Math.abs(value - continuous[0]))]
    } else {
        return []
    }
}

const toContinuous = (rgb, visParams, dataTypes) => {
    if (visParams.palette?.length < 2) {
        return []
    }

    const toSegment = (fromRgbValue, toRgbValue) => {
        const channels = fromRgbValue.rgb.map((from, i) => {
            const value = rgb[i]
            const to = toRgbValue.rgb[i]
            const range = to - from
            const factor = range
                ? _.clamp((value - from) / range, 0, 1)
                : 0
            return ({value, from, range, factor})
        })

        const fromValue = fromRgbValue.value
        const toValue = toRgbValue.value
        const error = getError(channels)
        const weightedMeanFactor = getWeightedMeanFactor(channels)
        // const preciseValue = fromValue + weightedMeanFactor * (toValue - fromValue)
        // const value = selectFrom(dataTypes, [visParams.bands[0], 'precision']) === 'int'
        //     ? Math.round(parseFloat(preciseValue))
        //     : parseFloat(preciseValue)
        return {error, fromValue, toValue, weightedMeanFactor}
    }

    const {palette, min: minList, max: maxList} = visParams
    const min = minList[0]
    const max = maxList[0]
    const paletteValues = palette.map((_color, i) => min + i * (max - min) / (palette.length - 1))
    const paletteRgbValueArray = palette.map((color, i) =>
        ({rgb: Color(color).rgb().array(), value: paletteValues[i]})
    )

    const segments = _.tail(palette).map((_color, i) => toSegment(paletteRgbValueArray[i], paletteRgbValueArray[i + 1]))

    if (segments.length) {
        const closestSegment = _.minBy(segments, 'error')
        const {fromValue, toValue, weightedMeanFactor} = closestSegment
        const preciseValue = fromValue + weightedMeanFactor * (toValue - fromValue)
        const value = selectFrom(dataTypes, [visParams.bands[0], 'precision']) === 'int'
            ? Math.round(parseFloat(preciseValue))
            : parseFloat(preciseValue)
        return [value]
    }

    return []
}

// Calculate the error as the multidimensional color distance (1 to 3 bands)
const getError = channels =>
    Math.sqrt(
        _.sum(
            channels.map(({value, from, range, factor}) => {
                const calculatedC = Math.round(from + factor * range)
                return Math.pow(calculatedC - value, 2)
            })
        )
    )

const getWeightedMeanFactor = channels => {
    const numerator = _.sum(channels.map(({range, factor}) => Math.abs(range) * factor))
    const denominator = _.sum(channels.map(({range}) => Math.abs(range)))
    return numerator / denominator
}
