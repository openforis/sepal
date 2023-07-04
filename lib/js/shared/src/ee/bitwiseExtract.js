const ee = require('#sepal/ee')

const bitwiseExtract = (value, fromBit, toBit) => {
    if (toBit === undefined) {
        toBit = fromBit
    }
    const maskSize = ee.Number(1).add(toBit).subtract(fromBit)
    const mask = ee.Number(1).leftShift(maskSize).subtract(1)
    return value.rightShift(fromBit).bitwiseAnd(mask)
}

module.exports = {bitwiseExtract}
