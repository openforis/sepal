const _ = require('lodash')

const imageProcessor = ({spec}) => {
    const bands = spec.bands
    const fromBands = Object.values(bands).map(band => band.name)
    const toBands = Object.keys(bands)
    const bandsToConvertToFloat = _.chain(bands)
        .pickBy(({scaled}) => scaled)
        .keys()
        .value()

    return image =>
        image
            .select(fromBands, toBands)
            .updateBands(bandsToConvertToFloat, image => image.divide(10000))
            .multiply(10000)
            .int16()
}

module.exports = imageProcessor
