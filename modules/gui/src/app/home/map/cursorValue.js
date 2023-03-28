import {selectFrom} from '../../../stateUtils'
import {withContext} from 'context'
import Color from 'color'
import React from 'react'
import _ from 'lodash'

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
    switch(type) {
    case 'continuous': return toContinuous(rgb, {...visParams, min, max}, dataTypes)
    case 'categorical': return toCategorical(rgb, visParams, dataTypes)
    case 'rgb': return toRgb(rgb, {...visParams, min, max}, dataTypes)
    case 'hsv': return toHsv(rgb, {...visParams, min, max}, dataTypes)
    default: return []
    }
}

const toRgb = (rgb, visParams, dataTypes) => {
    const {min, max, gamma} = visParams
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

const toHsv = (rgb, {bands, min, max, gamma}, dataTypes) => {
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
    const toSegment = (fromRgbValue, toRgbValue) => {
        const buffer = 5 // Sampled color can be off a bit
        const inRange = rgb.every((c, i) =>
            (fromRgbValue.rgb[i] - buffer <= c && toRgbValue.rgb[i] + buffer >= c) || (fromRgbValue.rgb[i] + buffer >= c && toRgbValue.rgb[i] - buffer <= c)
        )

        const channels = fromRgbValue.rgb.map((from, i) => {
            const c = rgb[i]
            const to = toRgbValue.rgb[i]
            const factor = from === to
                ? 1
                : (c - from) / (to - from)
            return ({
                c,
                from,
                to,
                diff: Math.abs(toRgbValue.rgb[i] - c),
                factor
            })
        })

        // Picking factor from channel with largest color diff - most accurate
        const referenceChannel = _.maxBy(channels, 'diff')
        const factor = referenceChannel.factor

        // An error in color
        // What color would we get if we used the reference factor?
        // Error is the difference in color
        const error = _.sum(
            channels.map(({c, from, to}) => {
                const calculatedC = Math.round(from + factor * (to - from))
                return Math.abs(calculatedC - c)
            })
        )

        const fromValue = fromRgbValue.value
        const toValue = toRgbValue.value
        const preciseValue = fromValue + factor * (toValue - fromValue)
        const value = selectFrom(dataTypes, [visParams.bands[0], 'precision']) === 'int'
            ? Math.round(parseFloat(preciseValue))
            : parseFloat(preciseValue)
        return {value, inRange, error}
    }

    const {palette, min: minList, max: maxList} = visParams
    const min = minList[0]
    const max = maxList[0]
    const paletteValues = palette.map((_color, i) => min + i * (max - min) / (palette.length - 1))
    const paletteRgbValueArray = palette.map((color, i) =>
        ({rgb: Color(color).rgb().array(), value: paletteValues[i]})
    )
    const segments = _.uniqBy(
        _.tail(palette)
            .map((_color, i) => toSegment(paletteRgbValueArray[i], paletteRgbValueArray[i + 1]))
            .filter(({inRange}) => inRange)
            .filter(({value}) => _.isFinite(value)),
        'value'
    )

    return segments.length
        ? [_.minBy(segments, 'error').value]
        : []
}

const sequence = (start, end, step = 1) =>
    end >= start
        ? Array.apply(null, {length: Math.floor((end - start) / step) + 1})
            .map((_, i) => i * step + start)
        : []
