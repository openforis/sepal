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

const number = ({value = 0, scale = '', precisionDigits = 3, prefix = '', unit = ''}) => {
    const join = (...items) => _.compact(items).join(' ')
    if (value === 0) {
        return join(prefix, '0', unit)
    }
    if (precisionDigits < 3) {
        throw new Error('Unsupported number of precision digits (less than 3).')
    }
    // safe from pico to yotta
    const magnitudes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    const scaleMagnitude = magnitudes.indexOf(scale)
    if (scaleMagnitude === -1) {
        throw new Error('Unsupported scale.')
    }
    const valueDigits = Math.floor(Math.log10(value))
    const decimals = valueDigits >= 0
        ? precisionDigits - valueDigits % 3 - 1
        : (precisionDigits - valueDigits - 1) % 3
    const shiftedValue = value * Math.pow(10, precisionDigits - valueDigits - 1)
    const normalizedValue = Math.round(shiftedValue) / Math.pow(10, decimals)
    const valueMagnitude = Math.floor(valueDigits / 3)
    const magnitude = scaleMagnitude + valueMagnitude
    return join(prefix, normalizedValue.toFixed(decimals), magnitudes[magnitude], unit)
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
