const ee = require('@google/earthengine')

const addMissingBands = () =>
    image => image
        .addBandsReplace(
            image.selectOrDefault(
                ['aerosol', 'cirrus'],
                ee.Image(0))
        )

module.exports = addMissingBands
