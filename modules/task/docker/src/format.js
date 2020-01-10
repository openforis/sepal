const fileSize = (size, {scale, precisionDigits} = {}) =>
    number({value: size, scale, precisionDigits, unit: 'B'})

// scale: the magnitude of the input value (e.g. 'k')
// minScale: the minimum magnitude of the output value (e.g. '')
// precisionDigits: the total number of digits of the output value (e.g. 34.56 = 4 digits)
// prefix: the prefix to be prepended to the output value (e.g. '$')
// unit: the suffix to be appended to the output magnitude (e.g. 'bytes')
const number = ({value = 0, scale = '', minScale = '', precisionDigits = 3, prefix = '', suffix = '', unit = ''}) => {
    const modulo3 = n => ((n % 3) + 3) % 3 // safe for negative numbers too
    const unitPadding = unit.length ? ' ' : ''
    const formattedValue = (normalizedValue, magnitude, decimals) =>
        prefix + normalizedValue.toFixed(decimals) + unitPadding + magnitudes[magnitude] + unit + suffix
    const magnitudes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    // handle case when value is zero
    if (value === 0) {
        return prefix + '0' + unitPadding + unit + suffix
    }
    // handle unsupported precision
    if (precisionDigits < 3) {
        throw Error('Unsupported number of precision digits (less than 3).')
    }

    const scaleMagnitude = magnitudes.indexOf(scale)
    // handle unsupported scale
    if (scaleMagnitude === -1) {
        throw Error('Unsupported scale.')
    }
    const valueDigits = Math.floor(Math.log10(value))
    const shiftLeft = precisionDigits - valueDigits - 1
    const shiftRight = precisionDigits - modulo3(valueDigits) - 1
    const normalizedValue = Math.round(value * Math.pow(10, shiftLeft)) / Math.pow(10, shiftRight)
    const valueMagnitude = Math.floor(valueDigits / 3)
    const magnitude = scaleMagnitude + valueMagnitude
    const minMagnitude = magnitudes.indexOf(minScale)
    if (magnitude > magnitudes.length - 1) {
        throw Error('Out of range.')
    } else if (magnitude < minMagnitude) {
        return formattedValue(normalizedValue / Math.pow(10, 3 * (minMagnitude - magnitude)), minMagnitude, precisionDigits - 1)
    } else {
        return normalizedValue < 1000
            ? formattedValue(normalizedValue, magnitude, shiftRight)
            : formattedValue(normalizedValue / 1000, magnitude + 1, precisionDigits - 1)
    }
}

module.exports = {
    fileSize,
    number
}
