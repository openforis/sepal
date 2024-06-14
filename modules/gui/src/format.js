import moment from 'moment'
import {NumericFormat} from 'react-number-format'

const integer = value => decimal(value, 0)

const decimal = (value, decimals = 2) =>
    <NumericFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}/>

const units = (value, precisionDigits = 3) => number({value, precisionDigits})
const unitsPerHour = (value, precisionDigits = 3) => number({value, precisionDigits, suffix: '/h'})
const dollars = (value, {precisionDigits = 3, prefix = '$', suffix} = {}) => number({value, precisionDigits, prefix, suffix, minScale: ''})
const dollarsPerHour = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, minScale: '', prefix, suffix: '/h'})
const dollarsPerMonth = (value, {precisionDigits = 3, prefix = '$'} = {}) => number({value, precisionDigits, minScale: '', prefix, suffix: '/mon'})

const hours = (value, decimals = 2) =>
    <NumericFormat
        value={value}
        displayType={'text'}
        thousandSeparator={true}
        decimalScale={decimals}
        fixedDecimalScale={true}
        suffix={'h'}/>

const percent = (part, total, decimals = 2) =>
    <NumericFormat
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

const fileSize = (size, {scale, precisionDigits, unit = 'B'} = {}) =>
    number({value: size, scale, precisionDigits, unit})

const fractionalYearsToDate = fractionalYear => {
    const year = Math.floor(fractionalYear)
    const fraction = fractionalYear - year
    const startOfYear = moment({year, month: 0, date: 1})
    const startOfNextYear = moment(startOfYear).add(1, 'years')
    const daysOfYear = startOfNextYear.diff(startOfYear, 'days')

    return startOfYear.add(Math.floor(daysOfYear * fraction), 'days').toDate()
}

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

    const formattedValue = (normalizedValue, magnitude, decimals) => {
        const adjustment = Math.floor(decimals / 3)
        const adjustedMagnitude = magnitude - adjustment
        const adjustedValue = normalizedValue * Math.pow(10, adjustment * 3)
        const adjustedDecimals = decimals - (adjustment * 3)
        return (negative ? '-' : '') + prefix + adjustedValue.toFixed(adjustedDecimals) + unitPadding + magnitudes[adjustedMagnitude] + unit + suffix
    }

    const modulo3 = n =>
        ((n % 3) + 3) % 3 // safe for negative numbers too

    // handle undefined/null value
    if (!Number.isFinite(value)) {
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

const significantDigits = ({value, min, max, minSteps}) => {
    const stepSize = Math.abs(max - min) / minSteps
    const stepSizeMagnitude = Math.floor(Math.log10(stepSize))
    const valueMagnitude = Math.floor(Math.log10(Math.abs(value)))
    const magnitude = valueMagnitude < stepSizeMagnitude
        ? stepSizeMagnitude
        : valueMagnitude - stepSizeMagnitude
    return (magnitude < 0 ? 0 : magnitude) + 1
}

const numberToMagnitude = ({value, magnitude, minScale = '', maxScale = 'Y', defaultValue = ''}) => {
    if (!Number.isFinite(value)) {
        return defaultValue
    }
    const scales = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    const scaleOffset = 4
    const scaleOfMagnitude = magnitude => scales[Math.floor((magnitude / 3) + scaleOffset)]
    const magnitudeOfScale = scale => (scales.indexOf(scale) - scaleOffset) * 3
    const roundedValue = round({value, magnitude})
    const valueMagnitude = toMagnitude(roundedValue)
    const precision = valueMagnitude - magnitude + 1

    const targetScaleMagnitude = Math.floor(valueMagnitude / 3) * 3
    const minScaleMagnitude = Math.floor((magnitude) / 3) * 3
    const maxDecimals = 2
    const maxScaleMagnitude = Math.floor((magnitude + maxDecimals) / 3) * 3

    const scaleMagnitude = Math.max(
        magnitudeOfScale(minScale),
        Math.min(
            magnitudeOfScale(maxScale),
            Math.max(
                minScaleMagnitude,
                Math.min(
                    maxScaleMagnitude, // Scaling more than this gives too many decimals
                    targetScaleMagnitude
                )
            )
        )
    )
    const multiplier = precision <= 0
        ? 0
        : Math.pow(10, -scaleMagnitude)
    const decimals = Math.max(0, scaleMagnitude - magnitude)
    const scaledValue = roundedValue * multiplier
    const scale = scaleOfMagnitude(scaleMagnitude)
    const valueInPrecision = parseFloat(scaledValue.toPrecision(Math.max(1, precision)))
    return addThousandSeparators(
        parseFloat(valueInPrecision)
            .toFixed(decimals) + scale
    )
}

const addThousandSeparators = numberString => {
    const i = numberString.indexOf('.')
    return i === -1
        ? numberString.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        : numberString.substring(0, i).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        + numberString.substring(i, numberString.length)
}

const round = ({value, magnitude}) => {
    const factor = Math.pow(10, magnitude)
    return Math.round(value / factor) * factor
}

const toMagnitude = value =>
    value === 0
        ? 0
        : Math.floor(Math.log10(Math.abs(value)))

const stepMagnitude = ({min, max, minSteps}) => toMagnitude(Math.abs(max - min) / minSteps)

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
    fractionalYearsToDate,
    date,
    fileSize,
    number,
    significantDigits,
    stepMagnitude,
    numberToMagnitude,
    round
}
