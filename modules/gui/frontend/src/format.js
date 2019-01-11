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
const unitsPerHour = (value, precisionDigits = 3) => number({value, precisionDigits, unit: '/h'})
const dollars = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, prefix})
const dollarsPerHour = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, prefix, unit: '/h'})
const dollarsPerMonth = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, prefix, unit: '/mon'})

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

const number = ({value = 0, scale = '', minScale = 'p', precisionDigits = 3, prefix = '', unit = ''}) => {
    const join = (...items) => _.compact(items).join(' ')
    const modulo3 = n => ((n % 3) + 3) % 3 // safe for negative numbers too
    const formattedValue = (normalizedValue, valueMagnitude, decimals) => {
        const magnitudes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
        const scaleMagnitude = magnitudes.indexOf(scale)
        if (scaleMagnitude === -1) {
            throw new Error('Unsupported scale.')
        }
        const magnitude = scaleMagnitude + valueMagnitude
        const minMagnitude = magnitudes.indexOf(minScale)
        if (magnitude < minMagnitude) {
            return join(prefix, Number(0).toFixed(decimals), magnitudes[minMagnitude] + unit)
        } else if (magnitude > magnitudes.length - 1) {
            throw new Error('Out of range.')
        } else {
            return join(prefix, normalizedValue.toFixed(decimals), magnitudes[magnitude] + unit)
        }
    }
    if (value === 0) {
        return join(prefix, '0', unit)
    }
    if (precisionDigits < 3) {
        throw new Error('Unsupported number of precision digits (less than 3).')
    }
    const valueDigits = Math.floor(Math.log10(value))
    const shiftLeft = precisionDigits - valueDigits - 1
    const shiftRight = precisionDigits - modulo3(valueDigits) - 1
    const normalizedValue = Math.round(value * Math.pow(10, shiftLeft)) / Math.pow(10, shiftRight)
    const valueMagnitude = Math.floor(valueDigits / 3)
    return normalizedValue < 1000
        ? formattedValue(normalizedValue, valueMagnitude, shiftRight)
        : formattedValue(normalizedValue / 1000, valueMagnitude + 1, precisionDigits - 1)
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
