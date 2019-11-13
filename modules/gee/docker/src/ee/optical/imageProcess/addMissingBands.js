const ee = require('@google/earthengine')

const addMissingBands = () =>
    image => image
        .addBands(image.selectOrDefault(
            ['aerosol', 'cirrus'],
            ee.Image(0))
        )

module.exports = addMissingBands
