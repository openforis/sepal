import {withContext} from 'context'
import Color from 'color'
import React from 'react'
import _ from 'lodash'

const CursorValueContext = React.createContext()

export const CursorValue = ({value$, children}) =>
    <CursorValueContext.Provider value={{cursorValue$: value$}}>
        {children}
    </CursorValueContext.Provider>

export const withCursorValue = withContext(CursorValueContext)

export const toBandValues = (rgb, visParams) => {
    const {type} = visParams
    switch(type) {
    case 'continuous': return toContinuous(rgb, visParams)
    default: return []
    }
}

const toContinuous = (rgb, visParams) => {

    const toSegment = (fromRgbValue, toRgbValue) => {
        const buffer = 5 // Sampled color can be off by 1
        const inRange = rgb.every((c, i) =>
            (fromRgbValue.rgb[i] - buffer <= c && toRgbValue.rgb[i] + buffer >= c) || (fromRgbValue.rgb[i] + buffer >= c && toRgbValue.rgb[i] - buffer <= c)
        )
        if (!inRange) {
            return {value: []}
        }

        const foo = fromRgbValue.rgb.map((from, i) => {
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
        const reference = _.maxBy(foo, 'diff')
        const factor = reference.factor

        // An error in color
        // What color would we get if we used the reference factor?
        // Error is the difference in color
        const error = _.sum(
            foo.map(({c, from, to}) => {
                const calculatedC = Math.round(from + factor * (to - from))
                return Math.abs(calculatedC - c)
            })
        )

        const fromValue = fromRgbValue.value
        const toValue = toRgbValue.value
        const preciseValue = fromValue + factor * (toValue - fromValue)
        const value = parseFloat(preciseValue.toPrecision(3))
        return {value, error}

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
            .filter(({value}) => _.isFinite(value)),
        'value'
    )
    return segments.length
        ? [_.minBy(segments, 'error').value]
        : []
}
