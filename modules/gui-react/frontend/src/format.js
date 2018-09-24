import NumberFormat from 'react-number-format'
import React from 'react'
import moment from 'moment'

const integer = (value) => decimal(value, 0)

const decimal = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}/>

const dollars = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        prefix={'$'}/>

const dollarsPerHour = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        prefix={'$'}
        suffix={'/hr'}/>

const hours = (value, decimals = 2) =>
    <NumberFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        suffix={'hr'}/>

const percent = (part, total, decimals = 2) =>
    <NumberFormat
        value={total > 0 ? 100 * part / total : 0}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        suffix={'%'}/>

const fullDateTime = (date) =>
    moment(date).format('ddd, DD MMM YYYY, hh:mm:ss')

const fullDate = (date) =>
    moment(date).format('ddd, DD MMM YYYY')

const date = (date) =>
    moment(date).format('DD MMM YYYY')

export default {
    integer,
    decimal,
    dollars,
    dollarsPerHour,
    hours,
    percent,
    fullDateTime,
    fullDate,
    date
}
