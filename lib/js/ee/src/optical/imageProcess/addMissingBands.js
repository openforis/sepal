const ee = require('#sepal/ee/ee')

const addMissingBands = () =>
    image => image
        .addBandsReplace(
            image.selectOrDefault(
                ['aerosol', 'cirrus'],
                ee.Image(0))
        )

module.exports = addMissingBands
