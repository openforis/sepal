import {msg} from 'translate'
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

const dollars = (value, precisionDigits = 3, prefix = '$') => number({value, precisionDigits, prefix})

// const dollars = (value, decimals = 2) =>
//     <NumberFormat
//         value={value}
//         displayType={'text'}
//         thousandSeparator={true}
//         decimalScale={decimals}
//         fixedDecimalScale={true}
//         prefix={'$'}/>

const dollarsPerHour = (value, precisionDigits = 3, prefix = '$') => number({value, precisionDigits, prefix, unit: '/h'})

// const dollarsPerHour = (value, decimals = 2) =>
//     <NumberFormat
//         value={value}
//         displayType={'text'}
//         thousandSeparator={true}
//         decimalScale={decimals}
//         fixedDecimalScale={true}
//         prefix={'$'}
//         suffix={'/h'}/>

const dollarsPerMonth = (value, {precisionDigits = 3, prefix = '$'}) => number({value, precisionDigits, prefix, unit: '/mon'})

// const dollarsPerMonth = (value, decimals = 0) =>
//     <NumberFormat
//         value={value}
//         displayType={'text'}
//         thousandSeparator={true}
//         decimalScale={decimals}
//         fixedDecimalScale={true}
//         prefix={'$'}
//         suffix={'/mon'}/>

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

const fileSize = (size, precisionDigits = 3) =>
    number({value: size, precisionDigits, unit: 'B', zero: msg('browse.info.empty')})

const number = ({value, precisionDigits = 3, prefix = '', unit = '', zero}) => {
    const join = (...items) => _.compact(items).join(' ')
    // safe up to yottabytes (10^24)...
    const magnitude = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    const digits = Math.trunc(Math.log10(value))
    const periods = Math.trunc(digits / 3)
    const multiplier = Math.pow(10, 3 * periods)
    const decimals = multiplier > 1
        ? Math.min(precisionDigits - 1, 2) - digits % 3
        : 0
    return value
        ? join(prefix, (value / multiplier).toFixed(decimals), magnitude[periods] + unit)
        : zero || join(prefix, '0', unit)
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
    fileSize
}
