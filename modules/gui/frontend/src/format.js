import NumberFormat from 'react-number-format'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'

const integer = value => decimal(value, 0)

const decimal = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}/>

const units = (value, precisionDigits = 3) => number({value, precisionDigits})
const unitsPerHour = (value, precisionDigits = 3) => number({value, precisionDigits, suffix: '/h'})
const dollars = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, prefix, minScale: ''})
const dollarsPerHour = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, minScale: '', prefix, suffix: '/h'})
const dollarsPerMonth = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, minScale: '', prefix, suffix: '/mon'})

const hours = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        suffix={'h'}/>

const percent = (part, total, decimals = 2) =>
    <NumberFormat
        value={total > 0 ? 100 * part / total : 0}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        suffix={'%'}/>

const fullDateTime = date =>
    moment(date).format('ddd, DD MMM YYYY, hh:mm:ss')

const fullDate = date =>
    moment(date).format('ddd, DD MMM YYYY')

const date = date =>
    moment(date).format('DD MMM YYYY')

const fileSize = (size, {scale, precisionDigits} = {}) =>
    number({value: size, scale, precisionDigits, unit: 'B'})

// scale: the magnitude of the input value (e.g. 'k')
// minScale: the minimum magnitude of the output value (e.g. '')
// precisionDigits: the total number of digits of the output value (e.g. 34.56 = 4 digits)
// prefix: the prefix to be prepended to the output value (e.g. '$')
// unit: the suffix to be appended to the output magnitude (e.g. 'bytes')
const number = ({value = 0, scale = '', minScale = '', precisionDigits = 3, prefix = '', suffix = '', unit = '', padding = false, defaultValue = ''}) => {
    if (precisionDigits < 3) {
        throw Error('Unsupported number of precision digits (less than 3).')
    }

    const magnitudes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    const scaleMagnitude = magnitudes.indexOf(scale)
    const unitPadding = unit.length ? ' ' : ''
    const length = 0
        + 1                     // sign
        + prefix.length         // prefix
        + (precisionDigits + 1) // value
        + unitPadding.length    // unit padding
        + 1                     // magnitude
        + unit.length           // unit
        + suffix.length         // suffix

    // handle unsupported scale
    if (scaleMagnitude === -1) {
        throw Error('Unsupported scale.')
    }
    
    const pad = value =>
        padding ? value.padStart(Math.max(length, defaultValue.length), ' ') : value

    const formattedValue = (normalizedValue, magnitude, decimals) =>
        (negative ? '-' : '') + prefix + normalizedValue.toFixed(decimals) + unitPadding + magnitudes[magnitude] + unit + suffix

    const modulo3 = n =>
        ((n % 3) + 3) % 3 // safe for negative numbers too
        
    // handle undefined/null value
    if (!_.isFinite(value)) {
        return pad(defaultValue)
    }

    // handle zero value
    if (value === 0) {
        return pad(`${prefix}0${unitPadding}${unit}${suffix}`)
    }
    
    const negative = value < 0
    const absValue = Math.abs(value)

    const valueDigits = Math.floor(Math.log10(absValue))
    const shiftLeft = precisionDigits - valueDigits - 1
    const shiftRight = precisionDigits - modulo3(valueDigits) - 1
    const normalizedValue = Math.round(absValue * Math.pow(10, shiftLeft)) / Math.pow(10, shiftRight)
    const valueMagnitude = Math.floor(valueDigits / 3)
    const magnitude = scaleMagnitude + valueMagnitude
    const minMagnitude = magnitudes.indexOf(minScale)
    if (magnitude > magnitudes.length - 1) {
        throw Error('Out of range.')
    } else if (magnitude < minMagnitude) {
        return pad(formattedValue(normalizedValue / Math.pow(10, 3 * (minMagnitude - magnitude)), minMagnitude, precisionDigits - 1))
    } else {
        return normalizedValue < 1000
            ? pad(formattedValue(normalizedValue, magnitude, shiftRight))
            : pad(formattedValue(normalizedValue / 1000, magnitude + 1, precisionDigits - 1))
    }
}

export default {
    integer,
    decimal,
    units,
    unitsPerHour,
    dollars,
    dollarsPerHour,
    dollarsPerMonth,
    hours,
    percent,
    fullDateTime,
    fullDate,
    date,
    fileSize,
    number
}
